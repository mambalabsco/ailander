import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { readProviderConfig } from "@/lib/provider-config";

/**
 * Cliente de Claude.
 *
 * La clave sale de la configuración del usuario, no de una variable de entorno:
 * cada cuenta usa la suya y se guarda donde el navegador no puede leerla.
 *
 * **Este módulo es el único que gasta dinero.** Todo lo que llega aquí es una
 * llamada facturada, así que nada lo importa por comodidad: siempre desde una
 * acción que el usuario ha pulsado a propósito.
 */

export async function createClaudeClient(): Promise<Anthropic> {
  const config = await readProviderConfig();

  if (!config.claudeApiKey) {
    throw new Error(
      "No hay clave de Claude configurada. Añádela en Configuración antes de generar.",
    );
  }

  return new Anthropic({
    apiKey: config.claudeApiKey,
    // Los documentos de investigación con búsqueda web tardan minutos. El valor
    // por defecto de 10 minutos se queda corto en los más pesados.
    timeout: 20 * 60 * 1000,
    maxRetries: 2,
  });
}

export async function researchModel(): Promise<string> {
  return (await readProviderConfig()).claudeModel || "claude-opus-5";
}

export async function copyModel(): Promise<string> {
  return (await readProviderConfig()).claudeCopyModel || "claude-sonnet-5";
}

/**
 * Modelo para convertir un informe en JSON.
 *
 * Es la segunda de las dos llamadas de cada documento, y la barata: no busca en
 * la web, no razona sobre el mercado, solo lee un texto que ya existe y rellena
 * un esquema. Pagarla a precio de Opus era gastar de más sin ganar nada.
 */
export async function extractionModel(): Promise<string> {
  return (await readProviderConfig()).claudeExtractionModel || "claude-sonnet-5";
}

/* ------------------------------ Coste estimado --------------------------------- */

/**
 * Precios por millón de tokens, para poder avisar **antes** de gastar.
 *
 * Están escritos a mano y pueden quedarse viejos; por eso lo que se enseña es
 * un orden de magnitud, no una factura. Lo que se cobra de verdad es lo que
 * diga Anthropic.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? PRICES["claude-opus-5"];
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/**
 * Cuánto cuesta aproximadamente un documento de investigación.
 *
 * **Medido, no supuesto.** La primera estimación salió cuatro veces por debajo
 * porque di por hecho unos 60.000 tokens de entrada. Un documento real gastó
 * **233.649 de entrada y 35.596 de salida**: cada vuelta de búsqueda web
 * arrastra todo el contexto anterior más los resultados nuevos, así que con
 * veintitantas búsquedas la entrada se acumula muy deprisa.
 *
 * El rango va de un documento tranquilo a uno como aquel, más la segunda
 * llamada de extracción (que es barata: relee el informe sin buscar nada).
 */
export function estimateResearchCost(model: string): { min: number; max: number } {
  return {
    min: estimateCost(model, 80_000, 15_000),
    max: estimateCost(model, 260_000, 45_000),
  };
}
