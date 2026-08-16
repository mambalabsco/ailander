import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { COPY_FORMAT_LABELS } from "@/types/copy";
import { readCopies } from "@/lib/data/copy";
import type {
  AdSet,
  AdUnit,
  Campaign,
  CampaignTree,
  Prelanding,
  ShortAd,
  ShortAdFormat,
} from "@/types/campaign";
import type { Tables } from "@/types/database";

/**
 * Campañas, conjuntos, anuncios cortos y prelandings.
 *
 * La jerarquía se lee en **una sola consulta anidada** y se arma en memoria. La
 * alternativa —una consulta por campaña, otra por conjunto, otra por anuncio—
 * es el problema N+1 clásico, y aquí sería especialmente malo porque un
 * producto acaba teniendo decenas de conjuntos.
 */

/* -------------------------------- Prelandings ---------------------------------- */

function toPrelanding(row: Tables<"prelandings">): Prelanding {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    url: row.url,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function readPrelandings(productId: string): Promise<Prelanding[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("prelandings")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las prelandings: ${error.message}`);
  return (data ?? []).map(toPrelanding);
}

export async function savePrelanding(
  input: Omit<Prelanding, "id" | "createdAt"> & { id?: string },
): Promise<Prelanding> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    name: input.name,
    url: input.url,
    description: input.description,
  };

  const query = input.id
    ? supabase.from("prelandings").update(row).eq("id", input.id)
    : supabase.from("prelandings").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar la prelanding: ${error.message}`);
  return toPrelanding(data);
}

export async function deletePrelanding(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("prelandings")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar la prelanding: ${error.message}`);
  return (count ?? 0) > 0;
}

/* --------------------------------- La jerarquía --------------------------------- */

function toCampaign(row: Tables<"campaigns">): Campaign {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    countryCode: row.country_code,
    theme: row.theme,
    stage: row.stage,
    focus: row.focus,
    createdAt: row.created_at,
  };
}

function toAdset(row: Tables<"adsets">): AdSet {
  return {
    id: row.id,
    productId: row.product_id,
    campaignId: row.campaign_id,
    number: row.number,
    name: row.name,
    stage: row.stage,
    focus: row.focus,
    destination: {
      type: row.destination as AdSet["destination"]["type"],
      prelandingId: row.prelanding_id ?? undefined,
      url: row.destination_url || undefined,
      plannedNote: row.destination_note || undefined,
    },
    angleId: row.angle_id ?? undefined,
    sourceAnalysisId: row.source_analysis_id ?? undefined,
    sourceLevel: (row.source_level || undefined) as AdSet["sourceLevel"],
    audience: row.audience,
    objective: row.objective,
    offerStack: row.offer_stack,
    alwaysInclude: row.always_include,
    createdAt: row.created_at,
  };
}

function toShortAd(row: Tables<"short_ads">): ShortAd {
  return {
    id: row.id,
    productId: row.product_id,
    adsetId: row.adset_id,
    number: row.number,
    name: row.name,
    format: row.format as ShortAdFormat,
    imagePrompt: row.image_prompt,
    content: {
      primaryText: row.primary_text,
      headline: row.headline,
      description: row.description,
    },
    createdAt: row.created_at,
  };
}

/** La estructura completa, lista para pintar. */
export async function readCampaignTrees(productId: string): Promise<CampaignTree[]> {
  const { supabase } = await requireContext();

  const [treeResult, copies] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, adsets(*, short_ads(*))")
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
    readCopies(productId),
  ]);

  if (treeResult.error) {
    throw new Error(`No se pudo leer la estructura: ${treeResult.error.message}`);
  }

  type NestedCampaign = Tables<"campaigns"> & {
    adsets: (Tables<"adsets"> & { short_ads: Tables<"short_ads">[] })[];
  };

  return ((treeResult.data ?? []) as NestedCampaign[]).map((campaignRow) => ({
    campaign: toCampaign(campaignRow),
    adsets: [...(campaignRow.adsets ?? [])]
      .sort((a, b) => a.number - b.number)
      .map((adsetRow) => {
        const ads = [...(adsetRow.short_ads ?? [])]
          .sort((a, b) => a.number - b.number)
          .map(toShortAd);

        // Un long copy es un anuncio de Meta como cualquier otro: su cuerpo va
        // en el texto principal, así que entra en la misma lista que los cortos.
        const longUnits: AdUnit[] = copies
          .filter((copy) => copy.adsetId === adsetRow.id)
          .map((copy) => ({
            kind: "largo" as const,
            copyId: copy.id,
            number: copy.adNumber ?? 0,
            name: copy.adName ?? copy.content.headline,
            headline: copy.content.headline,
            description: copy.content.description,
            primaryText: copy.content.primaryText,
            format: COPY_FORMAT_LABELS[copy.format],
            methodId: copy.methodId,
          }));

        const units: AdUnit[] = [
          ...ads.map((ad) => ({ kind: "corto" as const, ad })),
          ...longUnits,
        ].sort((a, b) => {
          const left = a.kind === "corto" ? a.ad.number : a.number;
          const right = b.kind === "corto" ? b.ad.number : b.number;
          return left - right;
        });

        return { adset: toAdset(adsetRow), ads, units };
      }),
  }));
}

/**
 * Siguientes números correlativos.
 *
 * En `short.md` la numeración es global por producto y no reinicia en cada
 * campaña: el conjunto 13 contenía los anuncios 36 a 40. Se pide el máximo con
 * `order` + `limit 1` en vez de traer todo y calcularlo en memoria.
 */
export async function nextNumbers(productId: string): Promise<{ adset: number; ad: number }> {
  const { supabase } = await requireContext();

  const [adsets, ads] = await Promise.all([
    supabase
      .from("adsets")
      .select("number")
      .eq("product_id", productId)
      .order("number", { ascending: false })
      .limit(1),
    supabase
      .from("short_ads")
      .select("number")
      .eq("product_id", productId)
      .order("number", { ascending: false })
      .limit(1),
  ]);

  return {
    adset: (adsets.data?.[0]?.number ?? 0) + 1,
    ad: (ads.data?.[0]?.number ?? 0) + 1,
  };
}

export async function saveCampaign(
  input: Omit<Campaign, "id" | "createdAt"> & { id?: string },
): Promise<Campaign> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    name: input.name,
    stage: input.stage,
    country_code: input.countryCode,
    theme: input.theme,
    focus: input.focus,
  };

  const query = input.id
    ? supabase.from("campaigns").update(row).eq("id", input.id)
    : supabase.from("campaigns").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar la campaña: ${error.message}`);
  return toCampaign(data);
}

export async function saveAdset(
  input: Omit<AdSet, "id" | "createdAt"> & { id?: string },
): Promise<AdSet> {
  const { supabase, userId } = await requireContext();

  const row = {
    user_id: userId,
    product_id: input.productId,
    campaign_id: input.campaignId,
    angle_id: input.angleId ?? null,
    source_analysis_id: input.sourceAnalysisId ?? null,
    // Cadena vacía y no nulo: la columna es `not null` con `check`, y ese vacío
    // es el que significa «no salió de un material».
    source_level: input.sourceLevel ?? "",
    name: input.name,
    number: input.number,
    stage: input.stage,
    focus: input.focus,
    destination: input.destination.type,
    prelanding_id: input.destination.prelandingId ?? null,
    destination_url: input.destination.url ?? "",
    destination_note: input.destination.plannedNote ?? "",
    audience: input.audience,
    objective: input.objective,
    offer_stack: input.offerStack,
    always_include: input.alwaysInclude,
  };

  const query = input.id
    ? supabase.from("adsets").update(row).eq("id", input.id)
    : supabase.from("adsets").insert(row);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`No se pudo guardar el conjunto: ${error.message}`);
  return toAdset(data);
}

export async function saveShortAds(
  ads: (Omit<ShortAd, "id" | "createdAt"> & { id?: string })[],
): Promise<ShortAd[]> {
  if (ads.length === 0) return [];

  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("short_ads")
    .insert(
      ads.map((ad) => ({
        user_id: userId,
        product_id: ad.productId,
        adset_id: ad.adsetId,
        name: ad.name,
        number: ad.number,
        format: ad.format,
        primary_text: ad.content.primaryText,
        headline: ad.content.headline,
        description: ad.content.description,
        image_prompt: ad.imagePrompt,
      })),
      { defaultToNull: false },
    )
    .select("*");

  if (error) throw new Error(`No se pudieron guardar los anuncios: ${error.message}`);
  return (data ?? []).map(toShortAd);
}

export async function deleteShortAd(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  const { error, count } = await supabase
    .from("short_ads")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar el anuncio: ${error.message}`);
  return (count ?? 0) > 0;
}
