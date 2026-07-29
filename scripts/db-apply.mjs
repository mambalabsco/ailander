import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { connectionString, connectionSource } from "./db-env.mjs";

/**
 * Aplica las migraciones de `supabase/migrations/` en orden.
 *
 * Se conecta directamente a Postgres en lugar de pasar por la CLI de Supabase
 * porque la CLI necesita además un token de acceso personal, y para esto basta
 * con la cadena de conexión que da el botón **Connect** del panel.
 *
 * Tres cosas que hace y conviene saber:
 *
 * 1. **Cada archivo va en su propia transacción.** Si el segundo falla, el
 *    primero queda aplicado y el tercero no se intenta. Es lo que se quiere:
 *    dejar la base a medias dentro de un archivo sería mucho peor que parar
 *    entre archivos, que es un punto de corte limpio.
 *
 * 2. **Lleva registro de lo aplicado** en `public.schema_migrations`, así que
 *    volver a ejecutarlo no repite nada. Sin esto, un `create type` ya
 *    existente aborta todo el archivo.
 *
 * 3. **No imprime la cadena de conexión.** Lleva la contraseña dentro.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const client = new pg.Client({
    connectionString: connectionString(),
    // Supabase sirve con certificado gestionado; el pooler no expone la CA
    // local, así que se acepta la cadena sin verificarla contra el almacén.
    ssl: { rejectUnauthorized: false },
    // Las migraciones son largas: sin esto, Postgres corta a los 30 segundos.
    statement_timeout: 120_000,
  });

  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Set(
      (await client.query("select version from public.schema_migrations")).rows.map(
        (row) => row.version,
      ),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();

    if (files.length === 0) {
      console.log("No hay migraciones que aplicar.");
      return;
    }

    let ran = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ya aplicada   ${file}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`  aplicando     ${file} ... `);

      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
        console.log("hecho");
        ran += 1;
      } catch (error) {
        await client.query("rollback");
        console.log("FALLÓ");
        console.error(`\n${file}: ${error.message}`);
        if (error.position) {
          // La posición es en caracteres desde el inicio del archivo; se
          // traduce a línea para poder ir directamente al sitio.
          const line = sql.slice(0, Number(error.position)).split("\n").length;
          console.error(`  línea ${line} de ${file}`);
        }
        if (error.detail) console.error(`  detalle: ${error.detail}`);
        if (error.hint) console.error(`  pista: ${error.hint}`);
        process.exit(1);
      }
    }

    console.log(
      ran === 0
        ? "\nTodo estaba aplicado, no había nada que hacer."
        : `\n${ran} migración(es) aplicadas.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const source = connectionSource();
  console.error(`No se pudo conectar: ${error.message}`);
  console.error(`\nLa cadena venía de ${source.from}.`.replace("de el ", "del "));

  if (source.shadowed) {
    console.error(
      [
        "",
        "OJO: tienes SUPABASE_DB_URL exportada en esta terminal con un valor",
        "distinto al de .env.local, y el del entorno es el que manda.",
        "",
        "  unset SUPABASE_DB_URL",
        "",
        "…o abre una terminal nueva, y se usará la del archivo.",
      ].join("\n"),
    );
  }

  process.exit(1);
});
