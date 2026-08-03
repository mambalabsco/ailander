import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type { SwipeCopy, SwipeStatus } from "@/types/swipe";

/**
 * Copys que ya se probaron, guardados como referencia.
 *
 * **Un copy que convirtió es la mejor referencia que existe**, y uno que fracasó
 * también: saber qué no funcionó evita repetirlo. Se pueden pegar de otros
 * productos —o de otras marcas— para adaptarlos a este.
 */

function toSwipe(row: {
  id: string;
  product_id: string | null;
  title: string;
  body: string;
  status: string;
  source: string | null;
  format: string | null;
  note: string | null;
  created_at: string;
}): SwipeCopy {
  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    title: row.title,
    body: row.body,
    status: (["funciona", "malo", "sin-probar"].includes(row.status)
      ? row.status
      : "sin-probar") as SwipeStatus,
    source: row.source ?? undefined,
    format: row.format ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Los copys guardados de un producto.
 *
 * ## Qué entra y por qué
 *
 * Los de **ese producto** y los guardados **sin producto**, que son los de otras
 * marcas pegados como referencia general. Los de otros productos no: un
 * advertorial de Ozempic en la ficha de un producto de tiroides confunde más de
 * lo que aporta, y sobre todo **entra en cada generación como patrón** — el
 * copy nuevo acaba imitando el de un producto que no es este.
 *
 * Aquí decía lo contrario: que no filtrar era deliberado, porque un copy que
 * funcionó en otro producto del mismo nicho sigue sirviendo. Eso es cierto y
 * sigue estando disponible: `listAllSwipeCopies` los trae todos, y la pantalla
 * los ofrece aparte y marcados. Lo que no puede es mezclarlos sin decirlo.
 */
export async function listSwipeCopies(productId?: string): Promise<SwipeCopy[]> {
  const { supabase } = await requireContext();

  let query = supabase.from("swipe_copies").select("*").order("created_at", { ascending: false });

  /*
   * `or` y no `eq`: los de este producto **y** los que no son de ninguno.
   *
   * Los segundos son los que se pegan de otras marcas antes de tener producto
   * al que atarlos, y esconderlos dejaría fuera justo los que más se usan al
   * empezar.
   */
  if (productId) query = query.or(`product_id.eq.${productId},product_id.is.null`);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer los copys guardados: ${error.message}`);

  return (data ?? []).map(toSwipe);
}

/**
 * Todos, sean de quien sean.
 *
 * Para la pantalla que ofrece traerse uno de otro producto a propósito. No se
 * usa en la generación: ahí entra solo lo de este producto, o el copy nuevo
 * imitaría el patrón de otro.
 */
export async function listAllSwipeCopies(): Promise<SwipeCopy[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("swipe_copies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los copys guardados: ${error.message}`);

  return (data ?? []).map(toSwipe);
}

export async function saveSwipeCopy(input: {
  productId?: string;
  title: string;
  body: string;
  status?: SwipeStatus;
  source?: string;
  format?: string;
  note?: string;
}): Promise<SwipeCopy> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("swipe_copies")
    .insert({
      user_id: userId,
      product_id: input.productId ?? null,
      title: input.title,
      body: input.body,
      status: input.status ?? "sin-probar",
      source: input.source ?? null,
      format: input.format ?? null,
      note: input.note ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  return toSwipe(data);
}

export async function setSwipeStatus(id: string, status: SwipeStatus): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("swipe_copies").update({ status }).eq("id", id);
  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
}

export async function deleteSwipeCopy(id: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from("swipe_copies").delete().eq("id", id);
}

/**
 * Los copys de referencia, en texto, para meterlos en un prompt.
 *
 * Los que **fallaron entran también**, marcados. Decirle al modelo qué no
 * funcionó es la mitad del aprendizaje, y omitirlos le deja repetir el error sin
 * saberlo.
 *
 * Se recortan: veinte copys enteros serían decenas de miles de tokens en cada
 * generación, y el modelo aprende el patrón con la cabeza de cada uno.
 */
export function describeSwipeCopies(copies: SwipeCopy[], maxChars = 2500): string {
  const usable = copies.filter((copy) => copy.status !== "sin-probar");
  if (usable.length === 0) return "";

  const lines = usable.slice(0, 8).map((copy) => {
    const label = copy.status === "funciona" ? "FUNCIONÓ" : "NO FUNCIONÓ";
    const body = copy.body.slice(0, maxChars);
    return `### ${label} — ${copy.title}${copy.source ? ` (${copy.source})` : ""}\n\n${body}${
      copy.body.length > maxChars ? "\n\n[...recortado]" : ""
    }`;
  });

  return `## Copys de referencia

Estos textos ya se probaron. Aprende de su estructura, su ritmo y su forma de entrar; **no los copies**.

Los marcados como NO FUNCIONÓ son igual de útiles: enseñan qué evitar.

${lines.join("\n\n")}`;
}
