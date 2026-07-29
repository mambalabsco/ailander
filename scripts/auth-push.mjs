import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Sube la configuración de Auth con las variables de `.env.local` cargadas.
 *
 * **Existe por un fallo silencioso y caro.** `supabase/config.toml` declara
 * `site_url = "env(NEXT_PUBLIC_SITE_URL)"`. Si esa variable no está en el
 * entorno cuando se ejecuta `supabase config push`, el CLI **no avisa**: sube la
 * cadena literal `env(NEXT_PUBLIC_SITE_URL)` como URL del sitio. Pasó de verdad
 * en este proyecto.
 *
 * A partir de ahí, los enlaces de confirmación de los correos apuntan a una URL
 * que no existe y nadie puede terminar de registrarse. El síntoma aparece lejos
 * de la causa —en el buzón de un usuario, no en la terminal—, así que es de los
 * que se tardan horas en encontrar.
 *
 * El CLI lee `.env`, pero Next usa `.env.local`, que es donde el usuario tiene
 * de verdad sus valores. Este puente los pasa al proceso hijo.
 */

const ENV_FILE = ".env.local";

function loadEnvFile() {
  let raw;
  try {
    raw = readFileSync(path.join(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return {};
  }

  const values = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    // Comillas opcionales alrededor del valor, como en cualquier archivo .env.
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const fromFile = loadEnvFile();

// El entorno manda sobre el archivo: así se puede apuntar a producción con
// `NEXT_PUBLIC_SITE_URL=https://... npm run auth:push` sin tocar nada.
const env = { ...fromFile, ...process.env };

const siteUrl = env.NEXT_PUBLIC_SITE_URL;

if (!siteUrl) {
  console.error(
    `Falta NEXT_PUBLIC_SITE_URL. Sin ella, «supabase config push» escribiría la cadena literal «env(NEXT_PUBLIC_SITE_URL)» como URL del sitio y los correos de confirmación dejarían de funcionar.\n\nDefínela en ${ENV_FILE} o pásala en la línea de comandos.`,
  );
  process.exit(1);
}

/*
 * El callback se deriva del sitio, no se escribe aparte.
 *
 * Son el mismo dato y mantenerlos a mano en dos sitios acaba con uno
 * desactualizado — y el síntoma aparece en el buzón de un usuario, no aquí.
 */
env.SUPABASE_AUTH_CALLBACK_URL =
  env.SUPABASE_AUTH_CALLBACK_URL || `${siteUrl.replace(/\/$/, "")}/auth/callback`;

// Cubre el callback con parámetros, que es como vuelve el enlace de recuperación.
env.SUPABASE_AUTH_WILDCARD =
  env.SUPABASE_AUTH_WILDCARD || `${siteUrl.replace(/\/$/, "")}/auth/**`;

// Se enseña antes de subir: es el valor que acabará en los correos que reciben
// tus usuarios, y conviene mirarlo una vez.
console.log(`site_url que se va a subir: ${siteUrl}`);
console.log(`callback:                   ${env.SUPABASE_AUTH_CALLBACK_URL}\n`);

const result = spawnSync("npx", ["supabase", "config", "push", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

/*
 * El fallo de Storage no se trata como fallo de todo.
 *
 * `config push` intenta configurar «vector buckets», que son de pago, y en un
 * plan gratuito devuelve 402 **después** de haber subido Auth correctamente.
 * Propagar ese código haría creer que no se aplicó nada.
 *
 * Los límites que de verdad protegen no vienen de aquí: cada bucket tiene los
 * suyos, más estrictos, puestos por la migración de Storage.
 */
process.exit(result.status ?? 1);
