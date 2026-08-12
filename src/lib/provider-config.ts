import { promises as fs } from "fs";
import path from "path";
import type { AiProvider, ProviderConfig, ProviderConfigView } from "@/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import * as db from "@/lib/data/provider";

/**
 * Lectura de la configuración del proveedor de IA.
 *
 * Vive fuera de las Server Actions para que los componentes de servidor puedan
 * comprobar si hay clave sin exponer un endpoint público. `readProviderConfig`
 * devuelve las claves en claro y **nunca** debe cruzar al cliente: para eso
 * está `toProviderConfigView`.
 */

const configPath = path.join(process.cwd(), "settings", "provider-config.json");

export const defaultProviderConfig: ProviderConfig = {
  activeProvider: "claude",
  claudeApiKey: "",
  chatgptApiKey: "",
  // Investigación: documentos largos con búsqueda web y razonamiento pesado.
  claudeModel: "claude-opus-5",
  // Redacción: copys y publirreportajes.
  claudeCopyModel: "claude-sonnet-5",
  /*
   * Sonnet 5, y ya no por la duda que decía antes.
   *
   * La duda era si Haiku 4.5 admitía `output_config.format`. **Sí lo admite**:
   * está en la lista de modelos con salidas estructuradas junto a Opus 5 y
   * Sonnet 5. Lo que impide bajarlo es otra cosa que se descubrió al ir a
   * hacerlo: **`effort` da error en Haiku 4.5**, y `extractStructured` manda
   * `effort: "low"`. Cambiar el modelo sin quitar antes ese parámetro rompe la
   * extracción de todos los documentos.
   *
   * Bajarlo se puede, entonces, pero cuesta tocar la llamada, y lo que hay en
   * juego son céntimos: la extracción lleva 0,09 dólares gastados en total
   * frente a los 73 de la investigación. No es ahí donde está el dinero.
   */
  claudeExtractionModel: "claude-sonnet-5",
  chatgptModel: "gpt-4.1",
  higgsfieldKeyId: "",
  higgsfieldKeySecret: "",
  syncApiKey: "",
  higgsfieldUsdPerCredit: 0,
};

export async function readProviderConfig(): Promise<ProviderConfig> {
  if (isSupabaseConfigured()) return db.readProviderConfig();

  const raw = await fs.readFile(configPath, "utf8").catch(() => null);
  if (!raw) return defaultProviderConfig;

  try {
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    return { ...defaultProviderConfig, ...parsed };
  } catch {
    return defaultProviderConfig;
  }
}

export function toProviderConfigView(config: ProviderConfig): ProviderConfigView {
  return {
    activeProvider: config.activeProvider,
    claudeModel: config.claudeModel,
    claudeCopyModel: config.claudeCopyModel,
    claudeExtractionModel: config.claudeExtractionModel,
    chatgptModel: config.chatgptModel,
    hasClaudeApiKey: Boolean(config.claudeApiKey),
    hasChatgptApiKey: Boolean(config.chatgptApiKey),
    hasHiggsfieldCredentials: Boolean(config.higgsfieldKeyId && config.higgsfieldKeySecret),
    hasSyncApiKey: Boolean(config.syncApiKey),
    higgsfieldUsdPerCredit: config.higgsfieldUsdPerCredit,
  };
}

export async function writeProviderConfig(config: ProviderConfig) {
  if (isSupabaseConfigured()) {
    await db.writeProviderConfig(config);
    return config;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return config;
}

/**
 * ¿Hay clave para el proveedor activo? Es la condición que habilita cualquier
 * generación: sin ella la plataforma no crea nada ni consume tokens.
 */
export async function hasActiveProviderKey(): Promise<boolean> {
  const config = await readProviderConfig();
  const provider: AiProvider = config.activeProvider;
  return provider === "claude" ? Boolean(config.claudeApiKey) : Boolean(config.chatgptApiKey);
}

/** Higgsfield necesita las dos mitades de la credencial para poder llamar. */
export async function hasHiggsfieldCredentials(): Promise<boolean> {
  const config = await readProviderConfig();
  return Boolean(config.higgsfieldKeyId && config.higgsfieldKeySecret);
}
