import pg from "pg";
import { connectionString, connectionSource } from "./db-env.mjs";

/**
 * Comprueba que la base quedó como debe.
 *
 * No es un adorno: una tabla sin RLS es legible por cualquier usuario
 * autenticado, y eso no se ve mirando la aplicación —funciona igual de bien—.
 * Solo aparece cuando hay dos cuentas y una ve los datos de la otra.
 *
 * Sale con código 1 si algo falla, para poder encadenarlo en un despliegue.
 */

const EXPECTED_TABLES = [
  "profiles",
  "stores",
  "store_markets",
  "products",
  "product_offers",
  "offer_tiers",
  "product_notes",
  "research_documents",
  "hooks",
  "angles",
  "campaigns",
  "prelandings",
  "adsets",
  "short_ads",
  "copies",
  "product_images",
  "ad_creatives",
  "performance_records",
  "analyses",
  "provider_configs",
];

const EXPECTED_BUCKETS = ["product-images", "ad-creatives"];

/** `provider_configs` no tiene SELECT a propósito: las claves no se leen desde el navegador. */
const NO_SELECT_BY_DESIGN = new Set(["provider_configs"]);

const tick = (ok) => (ok ? "✓" : "✗");

async function main() {
  const client = new pg.Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let failures = 0;
  const fail = () => (failures += 1);

  try {
    /* 1 · Tablas y RLS ---------------------------------------------------- */

    const { rows: tables } = await client.query(`
      select tablename, rowsecurity
      from pg_tables
      where schemaname = 'public'
      order by tablename;
    `);

    const byName = new Map(tables.map((row) => [row.tablename, row.rowsecurity]));

    console.log("Tablas y Row Level Security");
    for (const table of EXPECTED_TABLES) {
      const exists = byName.has(table);
      const rls = byName.get(table) === true;
      const ok = exists && rls;
      if (!ok) fail();
      console.log(
        `  ${tick(ok)} ${table.padEnd(22)} ${
          !exists ? "NO EXISTE" : rls ? "RLS activo" : "RLS DESACTIVADO"
        }`,
      );
    }

    /* 2 · Políticas por tabla --------------------------------------------- */

    const { rows: policies } = await client.query(`
      select tablename, cmd, count(*)::int as total
      from pg_policies
      where schemaname = 'public'
      group by tablename, cmd;
    `);

    const commands = new Map();
    for (const row of policies) {
      if (!commands.has(row.tablename)) commands.set(row.tablename, new Set());
      commands.get(row.tablename).add(row.cmd);
    }

    console.log("\nPolíticas (SELECT / INSERT / UPDATE / DELETE)");
    for (const table of EXPECTED_TABLES) {
      const found = commands.get(table) ?? new Set();
      const needed = NO_SELECT_BY_DESIGN.has(table)
        ? ["INSERT", "UPDATE", "DELETE"]
        : table === "profiles"
          ? ["SELECT", "UPDATE"]
          : ["SELECT", "INSERT", "UPDATE", "DELETE"];

      const missing = needed.filter((cmd) => !found.has(cmd));
      const ok = missing.length === 0;
      if (!ok) fail();

      const note = NO_SELECT_BY_DESIGN.has(table)
        ? found.has("SELECT")
          ? "  ← ¡tiene SELECT y no debería!"
          : "  (sin SELECT, correcto)"
        : "";

      if (NO_SELECT_BY_DESIGN.has(table) && found.has("SELECT")) fail();

      console.log(
        `  ${tick(ok)} ${table.padEnd(22)} ${[...found].sort().join(", ") || "ninguna"}${
          missing.length ? `  faltan: ${missing.join(", ")}` : ""
        }${note}`,
      );
    }

    /* 3 · Buckets de Storage ---------------------------------------------- */

    const { rows: buckets } = await client.query(`
      select id, public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = any($1::text[]);
    `, [EXPECTED_BUCKETS]);

    console.log("\nBuckets de Storage");
    for (const name of EXPECTED_BUCKETS) {
      const bucket = buckets.find((row) => row.id === name);
      const ok = bucket && bucket.public === false;
      if (!ok) fail();
      console.log(
        `  ${tick(ok)} ${name.padEnd(22)} ${
          !bucket
            ? "NO EXISTE"
            : bucket.public
              ? "PÚBLICO — debería ser privado"
              : `privado · ${Math.round(bucket.file_size_limit / 1024 / 1024)} MB · ${
                  (bucket.allowed_mime_types ?? []).length
                } tipos permitidos`
        }`,
      );
    }

    const { rows: storagePolicies } = await client.query(`
      select count(*)::int as total
      from pg_policies
      where schemaname = 'storage' and tablename = 'objects';
    `);

    const storageOk = storagePolicies[0].total >= 8;
    if (!storageOk) fail();
    console.log(
      `  ${tick(storageOk)} políticas de objetos    ${storagePolicies[0].total} (se esperaban 8)`,
    );

    /* 4 · Triggers de coherencia ------------------------------------------ */

    const { rows: triggers } = await client.query(`
      select count(*)::int as total
      from pg_trigger
      where not tgisinternal
        and tgfoid = 'public.assert_same_owner'::regproc;
    `);

    const triggersOk = triggers[0].total >= 15;
    if (!triggersOk) fail();
    console.log(
      `\nCoherencia entre tablas\n  ${tick(triggersOk)} triggers de propietario  ${triggers[0].total}`,
    );

    /* 5 · Creación automática del perfil ---------------------------------- */

    const { rows: authTrigger } = await client.query(`
      select count(*)::int as total
      from pg_trigger
      where tgname = 'on_auth_user_created';
    `);

    const profileOk = authTrigger[0].total === 1;
    if (!profileOk) fail();
    console.log(`  ${tick(profileOk)} perfil al registrarse    ${profileOk ? "sí" : "FALTA"}`);

    console.log(
      failures === 0
        ? "\nTodo correcto."
        : `\n${failures} comprobación(es) fallaron. Revisa lo marcado con ✗.`,
    );
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const source = connectionSource();
  console.error(`No se pudo comprobar: ${error.message}`);
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
