import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type {
  BlueprintSection,
  DetectedScript,
  OfferTier,
  SectionKind,
  ScriptKind,
} from "@/lib/store-blueprint";

/** Planos de tiendas analizadas. */

export interface SavedBlueprint {
  id: string;
  url: string;
  storeName: string;
  currency: string;
  sections: BlueprintSection[];
  offers: OfferTier[];
  guarantee: string;
  scripts: DetectedScript[];
  pages: { url: string; kind: string; title: string }[];
  notes: string;
  createdAt: string;
}

/**
 * Las columnas `jsonb` pueden traer cualquier cosa, así que se validan.
 *
 * Una sección sin `kind` o un tramo con precio no numérico no debe tirar la
 * pantalla entera: se descarta esa entrada y el resto del plano se lee. Un plano
 * a medias sigue siendo útil; una pantalla en blanco, no.
 */
function parseSections(value: unknown): BlueprintSection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.kind !== "string") return [];

    return [
      {
        kind: record.kind as SectionKind,
        purpose: typeof record.purpose === "string" ? record.purpose : "",
        angle: typeof record.angle === "string" ? record.angle : "",
        images: Number.isFinite(Number(record.images)) ? Number(record.images) : 0,
      },
    ];
  });
}

function parseOffers(value: unknown): OfferTier[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const quantity = Number(record.quantity);
    const price = Number(record.price);
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) return [];

    const compareAt = Number(record.compareAt);

    return [
      {
        quantity,
        price,
        compareAt: Number.isFinite(compareAt) && compareAt > 0 ? compareAt : null,
        highlighted: Boolean(record.highlighted),
      },
    ];
  });
}

function parseScripts(value: unknown): DetectedScript[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") return [];

    return [
      {
        kind: (record.kind as ScriptKind) ?? "otro",
        name: record.name,
        host: typeof record.host === "string" ? record.host : "",
        /*
         * Se asume **no importable** si el dato viene raro.
         *
         * Es el lado seguro: equivocarse hacia «no lo importes» cuesta una
         * consulta; equivocarse al revés mete el pixel de otro en tu tienda.
         */
        importable: record.importable === true,
        note: typeof record.note === "string" ? record.note : "",
      },
    ];
  });
}

export async function listBlueprints(): Promise<SavedBlueprint[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("store_blueprints")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los análisis: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    storeName: row.store_name,
    currency: row.currency,
    sections: parseSections(row.sections),
    offers: parseOffers(row.offers),
    guarantee: row.guarantee,
    scripts: parseScripts(row.scripts),
    pages: Array.isArray(row.pages) ? (row.pages as SavedBlueprint["pages"]) : [],
    notes: row.notes,
    createdAt: row.created_at,
  }));
}
