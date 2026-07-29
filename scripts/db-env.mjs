import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Carga `.env.local` y devuelve la cadena de conexión.
 *
 * Next.js lee `.env.local` solo, pero un script suelto de Node no: sin esto,
 * `npm run db:verify` fallaba pidiendo una variable que el usuario ya tenía
 * escrita en el archivo de al lado. Un error que manda a leer la documentación
 * cuando el dato ya está ahí es un error mal puesto.
 *
 * No usa ninguna librería: son cuatro líneas de análisis y añadir una
 * dependencia para esto no compensa.
 */

/** De dónde salió cada variable, para explicarlo cuando la conexión falle. */
const SOURCES = new Map();
/** Variables que el entorno pisa con un valor distinto al del archivo. */
const SHADOWED = new Set();

function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(path.join(process.cwd(), file), "utf8");
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals < 0) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();

    // Comillas opcionales alrededor del valor, como en cualquier .env.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Lo que ya viene del entorno manda: permite un `export` puntual sin tocar
    // el archivo. Se anota de dónde salió cada valor para poder avisar después.
    if (process.env[key] === undefined) {
      process.env[key] = value;
      SOURCES.set(key, file);
    } else if (process.env[key] !== value) {
      SOURCES.set(key, "el entorno");
      SHADOWED.add(key);
    } else {
      SOURCES.set(key, "el entorno");
    }
  }
}

/**
 * La cadena de conexión, la tenga escrita donde la tenga.
 *
 * Comprueba antes de conectar los tres fallos que se repiten —puerto 6543, host
 * directo con solo IPv6, y contraseña que corta la URL—, porque los tres dan
 * errores que mandan a buscar en el sitio equivocado: el del host es un
 * `ENOTFOUND` que parece un problema de red, y el de la contraseña acaba en
 * «password authentication failed» aunque la contraseña esté bien.
 *
 * Sobre escapar: solo `#`, `/` y `?` rompen la URL, y `%` se interpreta mal.
 * Los demás signos habituales (`!`, `$`, `&`, `*`, `+`) van tal cual.
 */
export function connectionString() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (!url) {
    console.error(
      [
        "Falta la cadena de conexión a Postgres.",
        "",
        "Lo más cómodo es dejarla en .env.local, que ya está en .gitignore:",
        "",
        '  SUPABASE_DB_URL="postgresql://postgres.TU_REF:CONTRASEÑA@aws-0-<región>.pooler.supabase.com:5432/postgres"',
        "",
        "La sacas del panel de Supabase: botón «Connect» → pestaña URI.",
        "",
        "Dos cosas que fallan siempre:",
        "  · Usa el puerto 5432 (sesión), no el 6543. El modo transacción no",
        "    admite todo lo que hacen las migraciones.",
        "  · Usa el host del pooler, no db.<ref>.supabase.co: ese solo tiene",
        "    IPv6 y la mayoría de conexiones no llegan.",
      ].join("\n"),
    );
    process.exit(1);
  }

  try {
    const parsed = new URL(url);
    if (!parsed.password) {
      console.error("La cadena no lleva contraseña. Sustituye [YOUR-PASSWORD] por la real.");
      process.exit(1);
    }
    if (parsed.port === "6543") {
      console.error(
        "Estás usando el puerto 6543 (modo transacción). Cámbialo por 5432: las\nmigraciones no funcionan en modo transacción.",
      );
      process.exit(1);
    }
    if (parsed.hostname.startsWith("db.")) {
      console.error(
        "Estás usando el host directo, que solo tiene IPv6 y casi nunca es\nalcanzable. Usa el del pooler: aws-0-<región>.pooler.supabase.com",
      );
      process.exit(1);
    }
  } catch {
    console.error(
      [
        "La cadena de conexión no es una URL válida.",
        "",
        "Casi siempre es un carácter de la contraseña que corta la URL. Los que",
        "la rompen de verdad son estos tres, y hay que sustituirlos:",
        "",
        "  #  →  %23        /  →  %2F        ?  →  %3F",
        "",
        "Y uno que no da error pero se interpreta mal:",
        "",
        "  %  →  %25        (si no, %40 dentro de tu contraseña se lee como @)",
        "",
        "El resto —incluidos ! $ & * + , ( ) '— van tal cual.",
      ].join("\n"),
    );
    process.exit(1);
  }

  return url;
}

/**
 * De dónde salió la cadena, para el mensaje de error.
 *
 * El fallo que más cuesta ver es este: un `export SUPABASE_DB_URL=...` viejo,
 * de otra sesión de la terminal, que tapa el valor correcto de `.env.local`.
 * Postgres responde «password authentication failed» y uno se pone a revisar
 * el archivo, que está bien.
 */
export function connectionSource() {
  const key = process.env.SUPABASE_DB_URL ? "SUPABASE_DB_URL" : "DATABASE_URL";
  return {
    key,
    from: SOURCES.get(key) ?? "el entorno",
    shadowed: SHADOWED.has(key),
  };
}
