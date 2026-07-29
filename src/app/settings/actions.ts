"use server";

import { revalidatePath } from "next/cache";
import {
  readProviderConfig,
  toProviderConfigView,
  writeProviderConfig,
} from "@/lib/provider-config";
import type { AiProvider, ProviderConfig, ProviderConfigView } from "@/types";

/**
 * Las Server Actions son endpoints públicos, así que ninguna de estas devuelve
 * las claves: solo el modelo activo y si hay clave guardada.
 */
export async function loadProviderConfig(): Promise<ProviderConfigView> {
  return toProviderConfigView(await readProviderConfig());
}

interface SaveProviderInput {
  activeProvider?: string;
  claudeModel?: string;
  claudeCopyModel?: string;
  claudeExtractionModel?: string;
  chatgptModel?: string;
  /** Cadena vacía = conservar la clave existente. */
  claudeApiKey?: string;
  chatgptApiKey?: string;
  higgsfieldKeyId?: string;
  higgsfieldKeySecret?: string;
}

export async function saveProviderConfig(input: SaveProviderInput): Promise<ProviderConfigView> {
  const current = await readProviderConfig();
  const provider: AiProvider = input.activeProvider === "chatgpt" ? "chatgpt" : "claude";

  const next: ProviderConfig = {
    activeProvider: provider,
    claudeModel: input.claudeModel?.trim() || current.claudeModel,
    claudeCopyModel: input.claudeCopyModel?.trim() || current.claudeCopyModel,
    claudeExtractionModel: input.claudeExtractionModel?.trim() || current.claudeExtractionModel,
    chatgptModel: input.chatgptModel?.trim() || current.chatgptModel,
    // Un campo vacío significa "no lo cambies", no "bórralo".
    claudeApiKey: input.claudeApiKey?.trim() ? input.claudeApiKey.trim() : current.claudeApiKey,
    chatgptApiKey: input.chatgptApiKey?.trim() ? input.chatgptApiKey.trim() : current.chatgptApiKey,
    higgsfieldKeyId: input.higgsfieldKeyId?.trim() || current.higgsfieldKeyId,
    higgsfieldKeySecret: input.higgsfieldKeySecret?.trim()
      ? input.higgsfieldKeySecret.trim()
      : current.higgsfieldKeySecret,
  };

  await writeProviderConfig(next);
  revalidatePath("/settings", "layout");

  return toProviderConfigView(next);
}

export async function clearHiggsfieldCredentials(): Promise<ProviderConfigView> {
  const current = await readProviderConfig();
  const next: ProviderConfig = { ...current, higgsfieldKeyId: "", higgsfieldKeySecret: "" };
  await writeProviderConfig(next);
  revalidatePath("/settings", "layout");
  return toProviderConfigView(next);
}

export async function clearProviderKey(provider: AiProvider): Promise<ProviderConfigView> {
  const current = await readProviderConfig();
  const next: ProviderConfig = {
    ...current,
    claudeApiKey: provider === "claude" ? "" : current.claudeApiKey,
    chatgptApiKey: provider === "chatgpt" ? "" : current.chatgptApiKey,
  };

  await writeProviderConfig(next);
  revalidatePath("/settings", "layout");

  return toProviderConfigView(next);
}
