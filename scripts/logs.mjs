import { connectionString } from "./db-env.mjs";

/**
 * Los errores recientes, en la terminal.
 *
 * **Existe para que se puedan leer sin abrir el panel de Supabase ni escribir
 * SQL a mano.** Cuando falló la tanda de investigación, la causa real estaba en
 * la base de datos y hubo que ir a buscarla con una consulta improvisada.
 *
 *   npm run logs              los 30 últimos
 *   npm run logs -- 100       los 100 últimos
 *   npm run logs -- 30 saldo  solo los de esa clase
 *
 * Junta tres fuentes porque un fallo deja rastro en sitios distintos: el
 * registro de errores, los trabajos que terminaron mal y las generaciones que
 * se cobraron sin dar resultado.
 */

const [limitArg, kindArg] = process.argv.slice(2);
const limit = Number(limitArg) > 0 ? Number(limitArg) : 30;

const RESET = "[0m";
const DIM = "[2m";
const RED = "[31m";
const YELLOW = "[33m";
const CYAN = "[36m";

/** Fecha y hora locales, que es como se piensa en «cuándo pasó esto». */
function stamp(value) {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const { default: pg } = await import("pg");
const client = new pg.Client({
  connectionString: connectionString(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const rows = [];

  const errors = await client.query(
    `select created_at, context, message, kind, stack, detail
       from error_log
      ${kindArg ? "where kind = $2" : ""}
      order by created_at desc limit $1`,
    kindArg ? [limit, kindArg] : [limit],
  );

  for (const row of errors.rows) {
    rows.push({
      at: row.created_at,
      source: "error",
      where: row.context,
      message: row.message,
      kind: row.kind,
      extra: row.detail ? JSON.stringify(row.detail) : null,
      stack: row.stack,
    });
  }

  // Trabajos que terminaron mal: puede haber fallos anteriores al registro.
  const jobs = await client.query(
    `select created_at, kind, label, error
       from background_jobs
      where status = 'error' order by created_at desc limit $1`,
    [limit],
  );

  for (const row of jobs.rows) {
    rows.push({
      at: row.created_at,
      source: "trabajo",
      where: row.kind,
      message: row.error ?? "(sin mensaje)",
      kind: null,
      extra: row.label,
      stack: null,
    });
  }

  // Generaciones que se cobraron y fallaron: son las que cuestan dinero.
  const runs = await client.query(
    `select created_at, kind, detail, error, cost_usd
       from generation_runs
      where status = 'error' order by created_at desc limit $1`,
    [limit],
  );

  for (const row of runs.rows) {
    rows.push({
      at: row.created_at,
      source: "gasto",
      where: row.kind,
      message: row.error ?? "(sin mensaje)",
      kind: null,
      extra: `${row.detail ?? ""} · $${Number(row.cost_usd).toFixed(2)}`,
      stack: null,
    });
  }

  rows.sort((a, b) => new Date(b.at) - new Date(a.at));

  if (rows.length === 0) {
    console.log("\nNo hay errores registrados.\n");
  } else {
    console.log(`\n${rows.length} entrada(s), de la más reciente a la más antigua:\n`);

    for (const row of rows.slice(0, limit)) {
      const color = row.source === "gasto" ? YELLOW : RED;
      console.log(
        `${DIM}${stamp(row.at)}${RESET}  ${color}${row.source.padEnd(8)}${RESET} ${CYAN}${row.where}${RESET}`,
      );
      console.log(`   ${row.message}`);
      if (row.kind) console.log(`   ${DIM}clase: ${row.kind}${RESET}`);
      if (row.extra) console.log(`   ${DIM}${row.extra}${RESET}`);
      if (row.stack) {
        // Solo las primeras líneas: la traza entera tapa el resto del listado.
        const head = row.stack.split("\n").slice(1, 4).join("\n   ");
        if (head.trim()) console.log(`   ${DIM}${head}${RESET}`);
      }
      console.log();
    }
  }
} finally {
  await client.end();
}
