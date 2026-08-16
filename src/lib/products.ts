import { createHash } from "crypto";
import type { Product, ProductResearchInputs, ProductStatus } from "@/types";
import type { Vertical } from "@/types/research";
import { findProduct, listOwnProducts, saveProduct } from "@/lib/store";
import { addProductImage } from "@/lib/image-store";
import { buildImageName } from "@/types/visuals";

/**
 * Alta de productos.
 *
 * Crear un producto **no** genera investigación ni consume tokens: guarda la
 * ficha y los datos que los prompts necesitarán. La generación de los 6
 * documentos es un paso explícito y separado, disponible solo cuando hay clave
 * de API configurada.
 */

export interface ProductDraftInput {
  name: string;
  brand: string;
  category: string;
  description: string;
  country: string;
  language: string;
  targetAudience: string;
  price: number;
  landingUrl: string;
  tone: string;
  /** En qué negocio está. Sin decir nada, e-commerce. */
  vertical?: Vertical;
  research: ProductResearchInputs;
  /** Tienda y mercado en los que se da de alta. */
  storeId?: string;
  marketId?: string;
  /** Handle de la ficha en la tienda, para reconstruir la URL de cada mercado. */
  handle?: string;
  /**
   * Imágenes traídas de la ficha de la tienda.
   *
   * Entran al catálogo del producto como subidas: son fotos reales, no
   * generadas, y la primera queda como principal porque suele ser el packshot.
   */
  importedImageUrls?: string[];
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createIdFromName(name: string) {
  return createHash("sha1").update(name).digest("hex").slice(0, 12);
}

/** Id estable a partir del nombre: `<slug>-<hash>`. */
export function buildProductId(name: string) {
  const slug = normalizeSlug(name) || "producto";
  return `${slug}-${createIdFromName(name)}`;
}

export async function createProduct(input: ProductDraftInput): Promise<Product> {
  const product: Product = {
    id: buildProductId(input.name),
    researchShared: false,
    vertical: input.vertical ?? "ecommerce",
    name: input.name,
    brand: input.brand || input.name,
    category: input.category,
    description: input.description,
    benefits: [],
    features: [],
    ingredients: [],
    targetAudience: input.targetAudience,
    problemsSolved: [],
    objections: [],
    country: input.country,
    language: input.language,
    price: input.price,
    landingUrl: input.landingUrl,
    images: [],
    tone: input.tone,
    status: "draft" as ProductStatus,
    createdAt: new Date().toISOString().slice(0, 10),
    owner: "own",
    researchInputs: input.research,
    storeId: input.storeId,
    marketId: input.marketId,
    handle: input.handle,
  };

  /*
   * **Se usa el producto que devuelve el guardado, no el de memoria.**
   *
   * El id de arriba es un slug legible, que es lo que servía en el modo local.
   * En Postgres la columna es `uuid` y la base de datos genera el suyo, así que
   * devolver el objeto de memoria daba un id que no existe: el alta funcionaba,
   * y el redirect posterior llevaba a un producto inexistente con un error de
   * sintaxis de uuid en pantalla.
   *
   * Las imágenes importadas cuelgan del mismo id real; con el slug se habrían
   * guardado apuntando a nada.
   */
  const saved = await saveProduct(product);

  // Las imágenes de la ficha importada entran ya nombradas, para poder citarlas
  // en el anuncio y localizar el archivo después.
  const imported = input.importedImageUrls ?? [];
  for (const [index, url] of imported.entries()) {
    await addProductImage({
      id: `img-${saved.id}-imp-${index}`,
      productId: saved.id,
      pattern: "subida",
      name: buildImageName({ productName: saved.name, pattern: "subida", index: index + 1 }),
      url,
      isPrimary: index === 0,
      source: "subida",
      createdAt: new Date().toISOString(),
    });
  }

  return saved;
}

export async function getCombinedProducts(): Promise<Product[]> {
  return listOwnProducts();
}

export async function findProductAnywhere(id: string): Promise<Product | null> {
  return findProduct(id);
}

/**
 * ¿Tiene el producto todo lo que los prompts necesitan?
 *
 * Se usa para avisar antes de generar, en vez de dejar que un documento salga
 * pobre por falta de una URL de competidor o del rango de edad.
 */
export function missingResearchInputs(product: Product): string[] {
  const inputs = product.researchInputs;
  const missing: string[] = [];

  if (!inputs?.niche) missing.push("Nicho");
  if (!inputs?.amazonUrl) missing.push("URL de Amazon del producto o uno similar");
  if (!product.description) missing.push("Descripción del producto");
  if (!product.country) missing.push("País objetivo");

  /*
   * La edad y el género **no** están aquí a propósito.
   *
   * El documento 1 los calcula: su apartado 5 dice literalmente «obligatoria o
   * generada automáticamente — si no se proporcionan datos demográficos, genere
   * automáticamente estimaciones de estilo SimilarWeb». Exigírselos a quien
   * está dando de alta el producto es pedirle justo lo que ha venido a
   * averiguar, y lo que escribiría sería una suposición metida en el prompt
   * como si fuera un dato.
   */
  return missing;
}

/**
 * Los competidores no están en `missingResearchInputs` porque no bloquean: si no
 * los has introducido, la plataforma los busca con IA y te los presenta para que
 * los confirmes antes de arrancar el documento 2.
 */
export function needsCompetitorSearch(product: Product): boolean {
  return !product.researchInputs?.competitorUrls?.length;
}
