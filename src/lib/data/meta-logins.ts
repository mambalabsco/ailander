import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { TablesUpdate } from "@/types/database";

/**
 * Las sesiones de Facebook.
 *
 * El token es **de la persona**, no de una tienda: con él se ven las cuentas de
 * todos los Business Manager a los que llegue ese perfil. Por eso se inicia
 * sesión una vez y las tiendas apuntan a la sesión, en vez de repetir el mismo
 * login —y la misma renovación cada sesenta días— en cada una.
 *
 * **El token no sale de aquí.** A la pantalla van el nombre y la caducidad; el
 * token solo lo usan las llamadas del servidor.
 */

export interface MetaLogin {
  id: string;
  name: string;
  expiresAt: Date | null;
  scopes: string[];
  metaAppId: string | null;
  isDefault: boolean;
}

export async function listMetaLogins(): Promise<MetaLogin[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("meta_logins")
    .select("id,name,token_expires_at,scopes,meta_app_id,is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las sesiones: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name || "Sin nombre",
    expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
    scopes: row.scopes ?? [],
    metaAppId: row.meta_app_id,
    isDefault: row.is_default,
  }));
}

/**
 * Guarda una sesión recién hecha.
 *
 * Se reconoce por el perfil **y la app**: el mismo perfil con dos apps distintas
 * son dos sesiones, porque el token de una no vale para la otra. Volver a
 * iniciar sesión con la misma pareja actualiza el token en vez de acumular
 * sesiones muertas.
 */
export async function saveMetaLogin(input: {
  name: string;
  accessToken: string;
  expiresAt: Date | null;
  scopes: string[];
  metaAppId: string | null;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data: existing } = await supabase
    .from("meta_logins")
    .select("id")
    .eq("name", input.name)
    .eq("meta_app_id", input.metaAppId ?? "")
    .maybeSingle();

  const values = {
    name: input.name,
    access_token: input.accessToken,
    token_expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    scopes: input.scopes,
    meta_app_id: input.metaAppId,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("meta_logins").update(values).eq("id", existing.id);
    if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);

    return existing.id;
  }

  // La primera es la de por defecto sin preguntar: si no, quedaría una lista
  // sin ninguna marcada y ninguna tienda podría leer su gasto.
  const { count } = await supabase
    .from("meta_logins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data, error } = await supabase
    .from("meta_logins")
    .insert({ user_id: userId, ...values, is_default: (count ?? 0) === 0 })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);

  return data.id;
}

export async function setDefaultMetaLogin(id: string): Promise<void> {
  const { supabase, userId } = await requireContext();

  await supabase
    .from("meta_logins")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  const changes: TablesUpdate<"meta_logins"> = { is_default: true };
  const { error } = await supabase.from("meta_logins").update(changes).eq("id", id);

  if (error) throw new Error(`No se pudo marcar por defecto: ${error.message}`);
}

export async function deleteMetaLogin(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("meta_logins").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar la sesión: ${error.message}`);
}

/** Deja elegida la sesión de una tienda. Vacío vuelve a la de por defecto. */
export async function setStoreMetaLogin(storeId: string, loginId: string): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("ad_credentials").upsert(
    {
      user_id: userId,
      store_id: storeId,
      provider: "facebook" as const,
      meta_login_id: loginId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,provider" },
  );

  if (error) throw new Error(`No se pudo elegir la sesión: ${error.message}`);
}

export interface ResolvedLogin {
  token: string;
  expiresAt: Date | null;
  loginId: string | null;
  metaAppId: string | null;
  name: string;
}

/**
 * Con qué token lee el gasto una tienda.
 *
 * El orden es: la sesión que ella eligió, la de por defecto, y el token viejo
 * guardado en su propia fila. Lo último es lo que ya tienen las tiendas
 * conectadas antes de que las sesiones existieran: sin eso dejarían de leer
 * gasto de golpe, que es lo que no puede pasar al actualizar.
 */
export async function resolveMetaLogin(storeId: string): Promise<ResolvedLogin | null> {
  const { supabase } = await requireContext();

  const { data: credentials } = await supabase
    .from("ad_credentials")
    .select("meta_login_id,access_token,token_expires_at")
    .eq("store_id", storeId)
    .eq("provider", "facebook")
    .maybeSingle();

  const pick = async (id: string) => {
    const { data } = await supabase
      .from("meta_logins")
      .select("id,name,access_token,token_expires_at,meta_app_id")
      .eq("id", id)
      .maybeSingle();

    return data;
  };

  const chosen = credentials?.meta_login_id ? await pick(credentials.meta_login_id) : null;

  const fallback =
    chosen ??
    (
      await supabase
        .from("meta_logins")
        .select("id,name,access_token,token_expires_at,meta_app_id")
        .eq("is_default", true)
        .maybeSingle()
    ).data;

  if (fallback?.access_token) {
    return {
      token: fallback.access_token,
      expiresAt: fallback.token_expires_at ? new Date(fallback.token_expires_at) : null,
      loginId: fallback.id,
      metaAppId: fallback.meta_app_id,
      name: fallback.name || "Sin nombre",
    };
  }

  if (credentials?.access_token) {
    return {
      token: credentials.access_token,
      expiresAt: credentials.token_expires_at ? new Date(credentials.token_expires_at) : null,
      loginId: null,
      metaAppId: null,
      name: "Sesión de esta tienda",
    };
  }

  return null;
}

/** El token de una sesión concreta, para renovarla. */
export async function readLoginToken(id: string): Promise<string | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("meta_logins")
    .select("access_token")
    .eq("id", id)
    .maybeSingle();

  return data?.access_token ?? null;
}

/** Guarda el token renovado sin tocar nada más. */
export async function refreshLoginToken(
  id: string,
  token: string,
  expiresAt: Date | null,
): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase
    .from("meta_logins")
    .update({
      access_token: token,
      token_expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`No se pudo guardar el token renovado: ${error.message}`);
}
