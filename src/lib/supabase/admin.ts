import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cliente con `service_role`: **salta todas las políticas RLS**.
 *
 * Se usa en un solo sitio: leer las claves de API del usuario, que a propósito
 * no tienen política de SELECT para que el navegador no pueda obtenerlas nunca.
 * Para cualquier otra cosa se usa el cliente de servidor normal, porque RLS es
 * la red de seguridad y saltársela por comodidad la deja de serlo.
 *
 * Cada uso obliga a comprobar a mano de quién son los datos que se piden: aquí
 * no hay nada que lo haga por ti.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Falta SUPABASE_SECRET_KEY. Solo se usa en el servidor y nunca debe llegar al navegador.",
    );
  }

  return createSupabaseClient<Database>(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasAdminCredentials(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}
