import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { looksLikeUuid } from "@/lib/uuid";
import { fromProduct, toProduct } from "@/lib/data/mappers";
import type { Product } from "@/types";
import type { ProductOffers } from "@/types/offer";
import { emptyOffers, type OfferTier } from "@/types/offer";
import { toOffers } from "@/lib/data/mappers";

/**
 * Productos en Supabase.
 *
 * Todas las consultas van con el cliente del usuario, así que pasan por RLS: si
 * alguna se olvidara de filtrar por dueño, la base de datos no devolvería nada
 * ajeno igualmente. El filtro por `user_id` que se ve aquí es para el
 * planificador —usa el índice—, no la barrera de seguridad.
 */

export async function listProducts(owner?: Product["owner"]): Promise<Product[]> {
  const { supabase } = await requireContext();

  let query = supabase
    .from("products")
    /*
     * Sin filtrar por usuario: lo decide la política de la base.
     *
     * Este filtro venía de cuando cada quien veía solo lo suyo. Con el espacio
     * de equipo, la política ya devuelve lo del espacio y con exclusiones
     * aplicadas — dejarlo aquí lo estrecha otra vez a una persona, y el efecto
     * es que a quien invitas ve su lista vacía sin que nada falle.
     */
    .select("*")
    .order("created_at", { ascending: false });

  if (owner) query = query.eq("owner", owner);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer los productos: ${error.message}`);

  return (data ?? []).map(toProduct);
}

export async function findProduct(id: string): Promise<Product | null> {
  if (!looksLikeUuid(id)) return null;

  const { supabase } = await requireContext();

  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el producto: ${error.message}`);

  return data ? toProduct(data) : null;
}

export async function createProduct(draft: Partial<Product>): Promise<Product> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("products")
    .insert({ ...fromProduct(draft), user_id: userId, name: draft.name ?? "" })
    .select("*")
    .single();

  if (error) throw new Error(`No se pudo crear el producto: ${error.message}`);
  return toProduct(data);
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
  const { supabase } = await requireContext();

  const changes = fromProduct(patch);
  if (Object.keys(changes).length === 0) return findProduct(id);

  const { data, error } = await supabase
    .from("products")
    .update(changes)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`No se pudo actualizar el producto: ${error.message}`);
  return data ? toProduct(data) : null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { supabase } = await requireContext();

  /*
   * Las filas se van solas con `on delete cascade`; **los archivos no**.
   *
   * Storage y Postgres son dos sistemas distintos: borrar `product_images` no
   * toca el bucket. Sin esto, cada producto borrado deja sus imágenes ocupando
   * espacio para siempre, sin ninguna fila que apunte a ellas y por tanto sin
   * forma de encontrarlas desde la interfaz. Se leen las rutas antes de borrar,
   * porque después ya no hay de dónde sacarlas.
   */
  const { data: images } = await supabase
    .from("product_images")
    .select("storage_path, storage_bucket")
    .eq("product_id", id);

  const { error, count } = await supabase
    .from("products")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(`No se pudo borrar el producto: ${error.message}`);

  // Después del borrado: si falla, quedan archivos sueltos —recuperables— en
  // vez de un producto que sigue vivo porque no se pudo limpiar el bucket.
  const paths = (images ?? []).filter((image) => image.storage_path);
  if (paths.length > 0) {
    const bucket = paths[0].storage_bucket || "product-images";
    await supabase.storage.from(bucket).remove(paths.map((image) => image.storage_path));
  }

  return (count ?? 0) > 0;
}

/* ----------------------------------- Ofertas ----------------------------------- */

export async function readOffers(productId: string): Promise<ProductOffers> {
  const { supabase } = await requireContext();

  const [offers, tiers] = await Promise.all([
    supabase.from("product_offers").select("*").eq("product_id", productId).maybeSingle(),
    supabase
      .from("offer_tiers")
      .select("*")
      .eq("product_id", productId)
      .order("position", { ascending: true }),
  ]);

  if (offers.error) throw new Error(`No se pudo leer la oferta: ${offers.error.message}`);
  if (tiers.error) throw new Error(`No se pudieron leer los packs: ${tiers.error.message}`);

  if (!offers.data && (tiers.data ?? []).length === 0) return emptyOffers();
  return toOffers(offers.data, tiers.data ?? []);
}

/**
 * Guarda la oferta entera.
 *
 * Los packs se reemplazan en bloque —borrar y volver a insertar— en lugar de
 * intentar casar cuáles cambiaron. El formulario los edita como una lista
 * completa, y son unas pocas filas por producto: reconciliarlas costaría más
 * código del que ahorra, y las incoherencias que evita son reales (un pack
 * borrado en el formulario que sobrevive en la base de datos).
 */
export async function saveOffers(productId: string, offers: ProductOffers): Promise<ProductOffers> {
  const { supabase, userId } = await requireContext();

  const { error: offerError } = await supabase.from("product_offers").upsert(
    {
      product_id: productId,
      user_id: userId,
      subscription_enabled: offers.subscription.enabled,
      subscription_discount_percent: offers.subscription.discountPercent,
      subscription_frequency: offers.subscription.frequency,
      subscription_perks: offers.subscription.perks,
      subscription_cancellation_policy: offers.subscription.cancellationPolicy,
      guarantee: offers.guarantee,
      free_shipping_threshold: offers.freeShippingThreshold ?? null,
      source: offers.source,
    },
    { onConflict: "product_id" },
  );

  if (offerError) throw new Error(`No se pudo guardar la oferta: ${offerError.message}`);

  const { error: deleteError } = await supabase
    .from("offer_tiers")
    .delete()
    .eq("product_id", productId);

  if (deleteError) throw new Error(`No se pudieron limpiar los packs: ${deleteError.message}`);

  if (offers.tiers.length > 0) {
    const { error: insertError } = await supabase.from("offer_tiers").insert(
      offers.tiers.map((tier: OfferTier, index: number) => ({
        user_id: userId,
        product_id: productId,
        label: tier.label,
        quantity: tier.quantity,
        total_price: tier.totalPrice,
        compare_at_price: tier.compareAtPrice ?? null,
        free_shipping: tier.freeShipping,
        gifts: tier.gifts,
        is_highlighted: tier.isHighlighted,
        note: tier.note ?? "",
        position: index,
      })),
      /*
       * `defaultToNull: false` — con la inserción en bloque, PostgREST monta una
       * sola sentencia con la unión de las claves de todos los objetos, y a los
       * que les falte alguna les manda NULL en vez del valor por defecto de la
       * columna. Con `free_shipping not null` eso es un 23502 en cuanto un pack
       * se construya sin ese campo. Aquí se envían todos siempre, así que hoy no
       * pasa; esto evita que pase el día que alguien añada un pack a mano.
       */
      { defaultToNull: false },
    );

    if (insertError) throw new Error(`No se pudieron guardar los packs: ${insertError.message}`);
  }

  return readOffers(productId);
}
