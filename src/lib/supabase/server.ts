import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cliente de servidor.
 *
 * Dos cosas importantes:
 *
 * 1. **Uno nuevo por petición.** Nunca se guarda en una variable de módulo: el
 *    cliente lleva dentro las cookies de sesión de quien está pidiendo, y
 *    compartirlo entre peticiones serviría los datos de un usuario a otro.
 *
 * 2. **`setAll` puede fallar y no pasa nada.** Desde un Server Component no se
 *    pueden escribir cookies; ahí el refresco de sesión lo hace `proxy.ts`, que
 *    corre antes y sí puede. Por eso el `catch` está vacío a propósito y no es
 *    un error silenciado por descuido.
 *
 * `server-only` arriba hace que el build falle si alguien lo importa desde un
 * componente cliente, en vez de descubrirlo en producción.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: las cookies las refresca proxy.ts.
        }
      },
    },
  });
}
