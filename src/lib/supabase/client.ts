import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cliente de navegador.
 *
 * Usa la publishable key, que no es un secreto: lo único que puede hacer con
 * ella un visitante es lo que las políticas RLS le permitan. Toda la seguridad
 * está en la base de datos, no en esconder esta clave.
 *
 * `createBrowserClient` ya devuelve una única instancia por pestaña, así que se
 * puede llamar en cada componente sin crear clientes de más.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
