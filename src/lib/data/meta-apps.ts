import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { chooseApp, envAppConfig } from "@/lib/meta-app";
import type { TablesUpdate } from "@/types/database";

/**
 * Las apps de Meta dadas de alta.
 *
 * Casi siempre hay una y no se toca. Hace falta una segunda solo cuando entra
 * un perfil de Facebook que no puede tener rol en la primera —un cliente, otra
 * empresa—, porque lo que decide qué cuentas se ven es el perfil que inicia
 * sesión, no la app.
 *
 * **El secreto entra y no sale.** Se guarda y a la pantalla solo vuelve si está
 * puesto: devolverlo lo dejaría en el HTML de cualquiera que abra la página.
 */

export interface MetaApp {
  id: string;
  name: string;
  appId: string;
  /** Nunca el secreto en sí, solo si lo hay. */
  hasSecret: boolean;
  configId: string;
  isDefault: boolean;
}

export async function listMetaApps(): Promise<MetaApp[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("meta_apps")
    .select("id,name,app_id,app_secret,config_id,is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las apps de Meta: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name || row.app_id,
    appId: row.app_id,
    hasSecret: Boolean(row.app_secret),
    configId: row.config_id,
    isDefault: row.is_default,
  }));
}

/** Con secreto incluido. Solo para el servidor, al iniciar sesión. */
export async function readMetaAppSecret(
  id: string,
): Promise<{ appId: string; appSecret: string; configId: string } | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("meta_apps")
    .select("app_id,app_secret,config_id")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  return { appId: data.app_id, appSecret: data.app_secret, configId: data.config_id };
}

/** La marcada por defecto, con su secreto. */
export async function readDefaultMetaApp(): Promise<{
  appId: string;
  appSecret: string;
  configId: string;
} | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("meta_apps")
    .select("app_id,app_secret,config_id")
    .eq("is_default", true)
    .maybeSingle();

  if (!data) return null;

  return { appId: data.app_id, appSecret: data.app_secret, configId: data.config_id };
}

export async function saveMetaApp(input: {
  /** Vacío para crear una nueva. */
  id?: string;
  name: string;
  appId: string;
  /** Vacío al editar significa «déjalo como estaba». */
  appSecret: string;
  configId: string;
  isDefault: boolean;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  if (input.isDefault) await clearDefault();

  if (input.id) {
    const changes: TablesUpdate<"meta_apps"> = {
      name: input.name,
      app_id: input.appId,
      config_id: input.configId,
      is_default: input.isDefault,
      updated_at: new Date().toISOString(),
    };

    // Solo se pisa el secreto si llega uno nuevo: el formulario lo manda vacío
    // cuando no se ha tocado, y escribirlo dejaría la app sin poder conectar.
    if (input.appSecret) changes.app_secret = input.appSecret;

    const { error } = await supabase.from("meta_apps").update(changes).eq("id", input.id);
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);

    return input.id;
  }

  const { data, error } = await supabase
    .from("meta_apps")
    .insert({
      user_id: userId,
      name: input.name,
      app_id: input.appId,
      app_secret: input.appSecret,
      config_id: input.configId,
      is_default: input.isDefault,
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear: ${error.message}`);

  return data.id;
}

async function clearDefault(): Promise<void> {
  const { supabase, userId } = await requireContext();

  await supabase
    .from("meta_apps")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);
}

export async function deleteMetaApp(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("meta_apps").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

/**
 * Deja elegida la app de una tienda. Vacío vuelve a la de por defecto.
 *
 * Se escribe sola, sin tocar el token: cambiar de app no desconecta nada, solo
 * dice contra qué app se hará el siguiente inicio de sesión.
 */
export async function setStoreMetaApp(storeId: string, metaAppId: string): Promise<void> {
  const { supabase, userId } = await requireContext();

  const { error } = await supabase.from("ad_credentials").upsert(
    {
      user_id: userId,
      store_id: storeId,
      provider: "facebook" as const,
      meta_app_id: metaAppId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,provider" },
  );

  if (error) throw new Error(`No se pudo elegir la app: ${error.message}`);
}

/** Una app concreta, con secreto, cayendo en la de por defecto si no existe. */
export async function resolveMetaAppById(id: string) {
  return chooseApp([await readMetaAppSecret(id), await readDefaultMetaApp(), envAppConfig()]);
}

/**
 * Con qué app se conecta una tienda, con secreto y todo.
 *
 * El orden es: la que ella eligió, la marcada por defecto, y la del entorno.
 * Así lo normal —una app para todo— no obliga a tocar nada en ninguna tienda, y
 * el caso raro —un perfil de Facebook que no puede tener rol en la primera— se
 * resuelve eligiendo en un desplegable.
 */
export async function resolveMetaApp(
  storeId: string,
): Promise<{ appId: string; appSecret: string; configId?: string } | null> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("ad_credentials")
    .select("meta_app_id")
    .eq("store_id", storeId)
    .eq("provider", "facebook")
    .maybeSingle();

  const chosen = data?.meta_app_id ? await readMetaAppSecret(data.meta_app_id) : null;

  return chooseApp([chosen, await readDefaultMetaApp(), envAppConfig()]);
}
