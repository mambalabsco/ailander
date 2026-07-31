import "server-only";

import { requireContext } from "@/lib/supabase/session";
import type {
  BlueprintSection,
  DetectedScript,
  OfferTier,
  PageKind,
  SectionKind,
  ScriptKind,
  StoredPage,
  VisualIdentitySummary,
} from "@/lib/store-blueprint";
import { PAGE_KINDS } from "@/lib/store-blueprint";

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
  identity: VisualIdentitySummary;
  pages: StoredPage[];
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
        /*
         * Un plano anterior a las tres páginas no trae `page` y se lee como
         * ficha de producto: es lo único que se analizaba entonces, así que
         * sigue sirviendo para lo mismo en vez de repartirse al azar.
         */
        page: PAGE_KINDS.includes(record.page as PageKind)
          ? (record.page as PageKind)
          : "producto",
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

/**
 * Las páginas leídas, con su texto.
 *
 * Los análisis anteriores a que se guardara el texto siguen leyéndose: llegan
 * con `text` vacío y `pagesAsModel` los descarta como modelo, que es lo correcto
 * —no hay nada que seguir— sin romper la pantalla del plano.
 */
function parsePages(value: unknown): StoredPage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string") return [];

    return [
      {
        url: record.url,
        kind: typeof record.kind === "string" ? record.kind : "otra",
        title: typeof record.title === "string" ? record.title : "",
        text: typeof record.text === "string" ? record.text : "",
      },
    ];
  });
}

/** Los colores y las tipografías, validados como el resto de columnas jsonb. */
function parseIdentity(value: unknown): VisualIdentitySummary {
  const empty: VisualIdentitySummary = { colors: [], fonts: [], buttonRadius: null };
  if (typeof value !== "object" || value === null) return empty;

  const record = value as Record<string, unknown>;

  const colors = Array.isArray(record.colors)
    ? record.colors.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const color = item as Record<string, unknown>;
        if (typeof color.hex !== "string") return [];

        return [
          {
            hex: color.hex,
            uses: Number.isFinite(Number(color.uses)) ? Number(color.uses) : 0,
            role: typeof color.role === "string" ? color.role : "otro",
          },
        ];
      })
    : [];

  const fonts = Array.isArray(record.fonts)
    ? record.fonts.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const font = item as Record<string, unknown>;
        if (typeof font.family !== "string") return [];

        return [
          {
            family: font.family,
            // Sin identificador no se puede aplicar al tema, y un identificador
            // que llegue raro es peor que ninguno: dejaría el tema sin fuente.
            handle: typeof font.handle === "string" ? font.handle : null,
          },
        ];
      })
    : [];

  return {
    colors,
    fonts,
    buttonRadius: typeof record.buttonRadius === "string" ? record.buttonRadius : null,
  };
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
    identity: parseIdentity(row.identity),
    pages: parsePages(row.pages),
    notes: row.notes,
    createdAt: row.created_at,
  }));
}
