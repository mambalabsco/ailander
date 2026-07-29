import "server-only";

import { headers } from "next/headers";

/**
 * El origen público de la aplicación.
 *
 * **No sale de `request.url` ni de `NEXT_PUBLIC_SITE_URL`, y las dos razones son
 * fallos que ya ocurrieron:**
 *
 * - `request.url` es la dirección del socket que ve Node, no la que escribió el
 *   visitante. Detrás de Caddy y Cloudflare eso es `localhost:3000`, así que las
 *   redirecciones llevaban ahí y los enlaces salían rotos.
 * - `NEXT_PUBLIC_SITE_URL` la incrusta Next **al compilar**. Si el build corrió
 *   antes de fijar el dominio, queda `localhost` grabado dentro y sigue ahí
 *   aunque la variable ya esté bien.
 *
 * Las cabeceras `x-forwarded-*` las pone el servidor que atiende cada petición,
 * así que aciertan siempre y sin depender de cuándo se compiló.
 */
export async function siteOrigin(): Promise<string> {
  const incoming = await headers();

  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  // Next ve una conexión HTTP plana aunque el visitante venga por HTTPS: quien
  // sabe el esquema real es el proxy de delante.
  const proto = incoming.get("x-forwarded-proto") ?? "https";

  if (host) return `${proto}://${host}`;

  // Último recurso, para desarrollo local sin proxy.
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
