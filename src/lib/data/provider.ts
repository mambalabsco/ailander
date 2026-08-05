import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/session";
import type { AiProvider, ProviderConfig } from "@/types";

/**
 * Claves de API del usuario.
 *
 * **Este es el único sitio de toda la aplicación que usa `service_role`**, y la
 * razón es deliberada: `provider_configs` no tiene política de SELECT, ni
 * siquiera para su dueño. Así, un fallo de XSS en la interfaz no se convierte
 * en una filtración de la clave de Anthropic — no hay forma de leerla desde el
 * navegador porque la base de datos no la sirve.
 *
 * Como el cliente administrador se salta RLS, aquí hay que comprobar a mano de
 * quién son los datos que se piden. Por eso cada función empieza resolviendo el
 * usuario de la sesión y filtra por su id: si eso se olvidara, cualquiera
 * podría leer las claves de cualquiera.
 */

const DEFAULTS: ProviderConfig = {
  activeProvider: "claude",
  claudeApiKey: "",
  chatgptApiKey: "",
  claudeModel: "claude-opus-5",
  claudeCopyModel: "claude-sonnet-5",
  claudeExtractionModel: "claude-sonnet-5",
  chatgptModel: "gpt-4.1",
  higgsfieldKeyId: "",
  higgsfieldKeySecret: "",
  syncApiKey: "",
  higgsfieldUsdPerCredit: 0,
};

export async function readProviderConfig(): Promise<ProviderConfig> {
  const user = await getUser();
  if (!user) return DEFAULTS;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("provider_configs")
    .select("*")
    // El filtro por el usuario de la sesión es lo único que hay aquí: el
    // cliente administrador no aplica RLS.
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return DEFAULTS;

  return {
    activeProvider: (data.active_provider as AiProvider) ?? DEFAULTS.activeProvider,
    claudeApiKey: data.anthropic_api_key ?? "",
    chatgptApiKey: data.chatgpt_api_key ?? "",
    claudeModel: data.claude_model || DEFAULTS.claudeModel,
    claudeCopyModel: data.claude_copy_model || DEFAULTS.claudeCopyModel,
    claudeExtractionModel: data.claude_extraction_model || DEFAULTS.claudeExtractionModel,
    chatgptModel: data.chatgpt_model || DEFAULTS.chatgptModel,
    higgsfieldKeyId: data.higgsfield_key_id ?? "",
    higgsfieldKeySecret: data.higgsfield_key_secret ?? "",
    syncApiKey: data.sync_api_key ?? "",
    // `numeric` llega como cadena, y `Number(null)` es cero: las dos cosas
    // acaban en el mismo sitio, que es «no hay tarifa».
    higgsfieldUsdPerCredit: Number(data.higgsfield_usd_per_credit) || 0,
  };
}

/**
 * Guarda la configuración.
 *
 * Una clave vacía significa «no la cambies», no «bórrala»: el formulario nunca
 * recibe las claves guardadas —no puede leerlas—, así que si enviara el campo
 * en blanco y eso borrara, cada vez que alguien cambiara el modelo perdería la
 * clave. Para borrarla de verdad hay un botón aparte.
 */
export async function writeProviderConfig(patch: Partial<ProviderConfig>): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("No hay sesión.");

  const admin = createAdminClient();
  const current = await readProviderConfig();

  const keep = (incoming: string | undefined, existing: string) =>
    incoming === undefined || incoming === "" ? existing : incoming;

  const { error } = await admin.from("provider_configs").upsert(
    {
      user_id: user.id,
      active_provider: patch.activeProvider ?? current.activeProvider,
      anthropic_api_key: keep(patch.claudeApiKey, current.claudeApiKey) || null,
      chatgpt_api_key: keep(patch.chatgptApiKey, current.chatgptApiKey) || null,
      claude_model: patch.claudeModel ?? current.claudeModel,
      claude_copy_model: patch.claudeCopyModel ?? current.claudeCopyModel,
      claude_extraction_model: patch.claudeExtractionModel ?? current.claudeExtractionModel,
      chatgpt_model: patch.chatgptModel ?? current.chatgptModel,
      higgsfield_key_id: keep(patch.higgsfieldKeyId, current.higgsfieldKeyId) || null,
      higgsfield_key_secret: keep(patch.higgsfieldKeySecret, current.higgsfieldKeySecret) || null,
      sync_api_key: keep(patch.syncApiKey, current.syncApiKey) || null,
      // `numeric` se manda como cadena: la columna la acepta y así no se pierde
      // precisión al pasar por el flotante de JavaScript.
      higgsfield_usd_per_credit:
        String(patch.higgsfieldUsdPerCredit ?? current.higgsfieldUsdPerCredit) === "0"
          ? null
          : String(patch.higgsfieldUsdPerCredit ?? current.higgsfieldUsdPerCredit),
    },
    { onConflict: "user_id", defaultToNull: false },
  );

  if (error) throw new Error(`No se pudo guardar la configuración: ${error.message}`);
}

/** Borra una clave concreta. Es la única forma de dejarla vacía. */
export async function clearProviderKey(
  key: "claude" | "chatgpt" | "higgsfield" | "sync",
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("No hay sesión.");

  const admin = createAdminClient();

  const columns =
    key === "claude"
      ? { anthropic_api_key: null }
      : key === "chatgpt"
        ? { chatgpt_api_key: null }
        : key === "sync"
          ? { sync_api_key: null }
          : { higgsfield_key_id: null, higgsfield_key_secret: null };

  const { error } = await admin
    .from("provider_configs")
    .update(columns)
    .eq("user_id", user.id);

  if (error) throw new Error(`No se pudo borrar la clave: ${error.message}`);
}
