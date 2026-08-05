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
   * Sonnet 5, no Haiku, y a propósito.
   *
   * La extracción usa `output_config.format`, que obliga a la respuesta a
   * cumplir el esquema. Sonnet 5 lo admite con seguridad; de Haiku 4.5 no me
   * consta. Elegir el más barato sin comprobarlo cambiaría un gasto conocido
   * por un fallo en cada documento, que sale mucho más caro.
   *
   * Aun así ahorra: $3/$15 por millón frente a $5/$25 de Opus. Se puede bajar
   * a Haiku desde Configuración si lo pruebas y funciona.
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
