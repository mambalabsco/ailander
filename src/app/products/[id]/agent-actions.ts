"use server";

import { revalidatePath } from "next/cache";
import type Anthropic from "@anthropic-ai/sdk";
import { copyModel, createClaudeClient } from "@/lib/claude";
import { findProductAnywhere } from "@/lib/products";
import { readProductResearch } from "@/lib/research-store";
import { listPosts, updatePost } from "@/lib/data/instagram";
import { TOOLS, buildAgentSystem } from "@/lib/instagram/tools";
import { generateInstagramAction, planWeekAction } from "@/app/products/[id]/instagram-actions";

const readText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Cuántas vueltas de herramienta se le dejan dar antes de cortar. */
const MAX_TURNOS = 6;

/**
 * Hablar con el agente, y que además **haga**.
 *
 * ## Por qué un bucle y no una llamada
 *
 * Porque una herramienta lleva a otra: mira la cola, ve que faltan reels,
 * escribe tres, y luego dice qué hizo. Con una sola llamada el modelo solo puede
 * pedir la primera y contestar a ciegas sobre el resto.
 *
 * Se corta a las seis vueltas. No por coste, sino porque un agente que sigue
 * llamando herramientas más allá de eso normalmente está atascado repitiendo la
 * misma —y seis son de sobra para mirar, escribir y confirmar.
 */
export async function agentChatAction(input: unknown): Promise<{
  ok: boolean;
  reply: string;
  did: string[];
}> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const productId = readText(raw.productId);
  const message = readText(raw.message);

  const history = Array.isArray(raw.history)
    ? (raw.history as { role: string; text: string }[]).slice(-10)
    : [];

  if (!productId || !message) return { ok: false, reply: "Falta el mensaje.", did: [] };

  try {
    const product = await findProductAnywhere(productId);
    if (!product) return { ok: false, reply: "Ese producto ya no existe.", did: [] };

    const research = await readProductResearch(productId).catch(() => null);

    const client = await createClaudeClient();
    const model = await copyModel();

    const messages: Anthropic.MessageParam[] = [
      ...history.map((one) => ({
        role: one.role === "agente" ? ("assistant" as const) : ("user" as const),
        content: one.text,
      })),
      { role: "user", content: message },
    ];

    const did: string[] = [];

    for (let turno = 0; turno < MAX_TURNOS; turno += 1) {
      const answer = await client.messages.create({
        model,
        max_tokens: 4_000,
        system: buildAgentSystem({
          productName: product.name,
          audience: product.targetAudience || "el público objetivo",
          country: product.country || "México",
          context: research?.master
            ? `Le duele: ${research.master.psychographics.painPoints.join("; ")}`
            : undefined,
        }),
        tools: TOOLS as unknown as Anthropic.Tool[],
        messages,
      });

      const calls = answer.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      const text = answer.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      // Sin herramientas, ha terminado de hablar.
      if (calls.length === 0) {
        revalidatePath(`/products/${productId}`);

        return { ok: true, reply: text || "Hecho.", did };
      }

      messages.push({ role: "assistant", content: answer.content });

      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const call of calls) {
        const args = (call.input ?? {}) as Record<string, unknown>;

        try {
          if (call.name === "ver_cola") {
            const posts = await listPosts(productId);

            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              /*
               * Se le da el gancho y la escena, no el pie entero.
               *
               * Con veinte publicaciones completas, la mitad del contexto se va
               * en lo que ya está escrito y queda menos para pensar lo nuevo.
               */
              content: JSON.stringify(
                posts.slice(0, 20).map((one) => ({
                  id: one.id,
                  formato: one.format,
                  gancho: one.caption.split("\n")[0],
                  escena: one.scene.slice(0, 120),
                  producto: one.showsProduct,
                  estado: one.status,
                  cuando: one.scheduledAt,
                })),
              ),
            });
            continue;
          }

          if (call.name === "escribir_publicaciones") {
            const result = await generateInstagramAction({
              productId,
              format: readText(args.formato) || "feed",
              count: Number(args.cuantas) || 3,
            });

            if (result.ok) did.push(result.message);

            results.push({ type: "tool_result", tool_use_id: call.id, content: result.message });
            continue;
          }

          if (call.name === "programar") {
            await updatePost(readText(args.id), { scheduledAt: readText(args.cuando) || null });

            did.push(`Programada una publicación para ${readText(args.cuando)}.`);
            results.push({ type: "tool_result", tool_use_id: call.id, content: "Programada." });
            continue;
          }

          if (call.name === "planificar_semana") {
            const result = await planWeekAction({
              productId,
              days: Number(args.dias) || 7,
              hour: Number(args.hora) || 19,
            });

            if (result.ok) did.push(result.message);

            results.push({ type: "tool_result", tool_use_id: call.id, content: result.message });
            continue;
          }

          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: `No existe la herramienta «${call.name}».`,
            is_error: true,
          });
        } catch (error) {
          /*
           * El fallo se le devuelve **a él**, no se lanza.
           *
           * Cortando aquí, la conversación muere y lo que ya había hecho se
           * queda sin contar. Devolviéndoselo, puede decirlo o intentar otra
           * cosa — que es lo que haría una persona.
           */
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: error instanceof Error ? error.message : "falló",
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: results });
    }

    revalidatePath(`/products/${productId}`);

    return {
      ok: true,
      reply: "Me he quedado dando vueltas. Mira la cola: puede que ya esté hecho a medias.",
      did,
    };
  } catch (error) {
    return {
      ok: false,
      reply: error instanceof Error ? error.message : "No se pudo hablar con el agente.",
      did: [],
    };
  }
}
