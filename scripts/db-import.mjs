import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { connectionString } from "./db-env.mjs";

/**
 * Trae a Supabase lo que había en los archivos locales.
 *
 * Al conectar la base, la aplicación dejó de leer `data/*.json` y `settings/`.
 * Los archivos no se tocaron —siguen ahí— pero nadie los mira, así que parece
 * que los datos se perdieron. Esto los sube.
 *
 * Tres decisiones:
 *
 * 1. **Por defecto no sube los datos de demostración.** Los productos
 *    `own-1`, `comp-1` y compañía venían con el andamiaje y son inventados;
 *    meterlos en una base recién creada es ruido que luego hay que limpiar a
 *    mano. Con `--todo` entran también. Lo que se salta se dice, no se calla.
 *
 * 2. **Las imágenes se descargan y se suben al bucket.** Estaban apuntando al
 *    CDN de la tienda; si esa ficha cambia o se borra, se quedan rotas. Al
 *    subirlas pasan a ser tuyas y a servirse con URL firmada.
 *
 * 3. **Es idempotente por nombre.** Si algo ya existe no se duplica, así que se
 *    puede ejecutar dos veces sin miedo.
 *
 *   npm run db:import              solo tus datos reales
 *   npm run db:import -- --todo    también los de demostración
 *   npm run db:import -- --seco    enseña qué haría, sin escribir nada
 */

const ARGS = process.argv.slice(2);
const INCLUDE_DEMO = ARGS.includes("--todo");
const DRY_RUN = ARGS.includes("--seco");

/** Identificadores que vinieron con el andamiaje, no del usuario. */
const DEMO_IDS = new Set([
  "own-1",
  "own-2",
  "comp-1",
  "comp-2",
  "store-principal",
  "ad-1",
  "ad-2",
  "analysis-1",
  "analysis-2",
]);

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function readJson(file, fallback) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) return fallback;
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch (error) {
    console.error(`  no se pudo leer ${file}: ${error.message}`);
    return fallback;
  }
}

function extensionFor(mimeType) {
  return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" }[
    mimeType
  ] ?? "bin";
}

async function main() {
  // Reutiliza el cargador de .env.local; la cadena en sí no hace falta aquí,
  // pero sus comprobaciones avisan pronto si la configuración está a medias.
  connectionString();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
    process.exit(1);
  }

  const admin = createClient(url, secret, { auth: { persistSession: false } });

  /* A quién pertenece todo esto ------------------------------------------- */

  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) {
    console.error(`No se pudo consultar los usuarios: ${usersError.message}`);
    process.exit(1);
  }

  const emailArg = ARGS.find((arg) => arg.includes("@"));
  const user = emailArg
    ? users.users.find((item) => item.email === emailArg)
    : users.users.length === 1
      ? users.users[0]
      : null;

  if (!user) {
    console.error(
      users.users.length === 0
        ? "No hay ninguna cuenta creada todavía. Regístrate en /auth/signup y vuelve a ejecutar esto."
        : `Hay varias cuentas. Indica cuál:\n${users.users.map((item) => `  npm run db:import -- ${item.email}`).join("\n")}`,
    );
    process.exit(1);
  }

  const uid = user.id;
  console.log(`Importando a la cuenta ${user.email}`);
  if (DRY_RUN) console.log("MODO SECO: no se escribe nada.\n");
  if (!INCLUDE_DEMO) console.log("Se omiten los datos de demostración (usa --todo para incluirlos).\n");

  /* Tiendas y mercados ----------------------------------------------------- */

  const storeIdMap = new Map();
  const marketIdMap = new Map();
  const stores = readJson("data/stores.json", []);

  console.log("Tiendas");
  for (const store of stores) {
    if (!INCLUDE_DEMO && DEMO_IDS.has(store.id)) {
      console.log(`  – ${store.name}  (demostración, omitida)`);
      continue;
    }

    const { data: existing } = await admin
      .from("stores")
      .select("id")
      .eq("user_id", uid)
      .eq("name", store.name)
      .maybeSingle();

    if (existing) {
      storeIdMap.set(store.id, existing.id);
      console.log(`  = ${store.name}  (ya estaba)`);
    } else if (DRY_RUN) {
      // Marcador de posición: sin él, los mercados y las imágenes de después
      // dirían que su tienda o su producto no se importó, que es justo lo
      // contrario de lo que va a pasar.
      storeIdMap.set(store.id, "seco");
      console.log(`  + ${store.name}`);
    } else {
      const { data, error } = await admin
        .from("stores")
        .insert({
          user_id: uid,
          name: store.name,
          brand: store.brand ?? "",
          domain: store.domain ?? "",
          platform: store.platform ?? "otra",
          mention_brand_in_copy: store.mentionBrandInCopy ?? true,
        })
        .select("id")
        .single();

      if (error) {
        console.log(`  ✗ ${store.name}: ${error.message}`);
        continue;
      }
      storeIdMap.set(store.id, data.id);
      console.log(`  + ${store.name}`);
    }

    const newStoreId = storeIdMap.get(store.id);
    if (!newStoreId) continue;

    for (const market of store.markets ?? []) {
      if (DRY_RUN) {
        marketIdMap.set(market.id, "seco");
        console.log(`      + mercado ${market.countryName}/${market.currency}`);
        continue;
      }

      const { data: existingMarket } = await admin
        .from("store_markets")
        .select("id")
        .eq("store_id", newStoreId)
        .eq("country_code", market.countryCode)
        .eq("language_code", market.languageCode)
        .maybeSingle();

      if (existingMarket) {
        marketIdMap.set(market.id, existingMarket.id);
        continue;
      }
      if (DRY_RUN) {
        marketIdMap.set(market.id, "seco");
        console.log(`      + mercado ${market.countryName}/${market.currency}`);
        continue;
      }

      const { data, error } = await admin
        .from("store_markets")
        .insert({
          user_id: uid,
          store_id: newStoreId,
          country_code: market.countryCode,
          country_name: market.countryName,
          language_code: market.languageCode,
          language_name: market.languageName,
          currency: market.currency,
          domain: market.domain ?? "",
          path_prefix: market.pathPrefix ?? "",
          is_primary: market.isPrimary ?? false,
        })
        .select("id")
        .single();

      if (error) {
        console.log(`      ✗ mercado ${market.countryName}: ${error.message}`);
        continue;
      }
      marketIdMap.set(market.id, data.id);
      console.log(`      + mercado ${market.countryName}/${market.currency}`);
    }
  }

  /* Productos -------------------------------------------------------------- */

  const productIdMap = new Map();
  const products = readJson("data/products.json", []);

  console.log("\nProductos");
  for (const product of products) {
    if (!INCLUDE_DEMO && DEMO_IDS.has(product.id)) {
      console.log(`  – ${product.name}  (demostración, omitido)`);
      continue;
    }

    const { data: existing } = await admin
      .from("products")
      .select("id")
      .eq("user_id", uid)
      .eq("name", product.name)
      .maybeSingle();

    if (existing) {
      productIdMap.set(product.id, existing.id);
      console.log(`  = ${product.name}  (ya estaba)`);
      continue;
    }
    if (DRY_RUN) {
      productIdMap.set(product.id, "seco");
      console.log(`  + ${product.name}`);
      continue;
    }

    const research = product.researchInputs ?? {};
    const { data, error } = await admin
      .from("products")
      .insert({
        user_id: uid,
        store_id: storeIdMap.get(product.storeId) ?? null,
        market_id: marketIdMap.get(product.marketId) ?? null,
        name: product.name,
        brand: product.brand ?? "",
        category: product.category ?? "",
        description: product.description ?? "",
        target_audience: product.targetAudience ?? "",
        country: product.country ?? "",
        language: product.language ?? "",
        price: product.price ?? 0,
        landing_url: product.landingUrl ?? "",
        handle: product.handle ?? "",
        tone: product.tone ?? "",
        status: product.status ?? "draft",
        owner: product.owner ?? "own",
        benefits: product.benefits ?? [],
        features: product.features ?? [],
        ingredients: product.ingredients ?? [],
        problems_solved: product.problemsSolved ?? [],
        objections: product.objections ?? [],
        niche: research.niche ?? "",
        competitor_urls: research.competitorUrls ?? [],
        amazon_url: research.amazonUrl ?? "",
        target_age_range: research.targetAgeRange ?? "",
        target_genders: research.targetGenders ?? [],
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  ✗ ${product.name}: ${error.message}`);
      continue;
    }

    productIdMap.set(product.id, data.id);
    console.log(
      `  + ${product.name}` +
        (research.competitorUrls?.length ? `  (${research.competitorUrls.length} competidores)` : ""),
    );
  }

  /* Imágenes --------------------------------------------------------------- */

  const images = readJson("data/product-images.json", []);

  console.log("\nImágenes");
  if (images.length === 0) console.log("  (ninguna)");

  for (const image of images) {
    const newProductId = productIdMap.get(image.productId);
    if (!newProductId) {
      console.log(`  – ${image.name}  (su producto no se importó)`);
      continue;
    }

    const { data: existing } = await admin
      .from("product_images")
      .select("id")
      .eq("product_id", newProductId)
      .eq("name", image.name)
      .maybeSingle();

    if (existing) {
      console.log(`  = ${image.name}  (ya estaba)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  + ${image.name}`);
      continue;
    }

    // Se descarga del sitio donde esté —CDN de la tienda o carpeta pública— y
    // se sube al bucket privado. Así deja de depender de un tercero.
    let bytes;
    let contentType;
    try {
      const source = image.url.startsWith("http")
        ? image.url
        : `file://${path.join(process.cwd(), "public", image.url.replace(/^\//, ""))}`;

      const response = await fetch(source);
      if (!response.ok) throw new Error(`respondió ${response.status}`);

      contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.log(`  ✗ ${image.name}: no se pudo descargar (${error.message})`);
      continue;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      console.log(`  ✗ ${image.name}: tipo no admitido (${contentType || "desconocido"})`);
      continue;
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      console.log(`  ✗ ${image.name}: pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
      continue;
    }

    // El id del usuario va primero: es lo que comprueba la política de Storage.
    const storagePath = `${uid}/${newProductId}/${image.name}.${extensionFor(contentType)}`;

    const { error: uploadError } = await admin.storage
      .from("product-images")
      .upload(storagePath, bytes, { contentType, upsert: true });

    if (uploadError) {
      console.log(`  ✗ ${image.name}: ${uploadError.message}`);
      continue;
    }

    if (image.isPrimary) {
      await admin.from("product_images").update({ is_primary: false }).eq("product_id", newProductId);
    }

    const { error } = await admin.from("product_images").insert({
      user_id: uid,
      product_id: newProductId,
      pattern: image.pattern ?? "subida",
      name: image.name,
      storage_path: storagePath,
      storage_bucket: "product-images",
      mime_type: contentType,
      size_bytes: bytes.length,
      prompt: image.prompt ?? "",
      model_id: image.modelId ?? "",
      is_primary: Boolean(image.isPrimary),
      source: image.source ?? "subida",
    });

    if (error) {
      await admin.storage.from("product-images").remove([storagePath]);
      console.log(`  ✗ ${image.name}: ${error.message}`);
      continue;
    }

    console.log(
      `  + ${image.name}  (${(bytes.length / 1024).toFixed(0)} KB)${image.isPrimary ? " [principal]" : ""}`,
    );
  }

  /* Biblioteca, historial y rendimiento ------------------------------------ */

  const ads = readJson("data/ads.json", []);
  const analyses = readJson("data/analyses.json", []);
  const performance = readJson("data/performance.json", []);

  console.log("\nBiblioteca, historial y rendimiento");

  for (const ad of ads) {
    if (!INCLUDE_DEMO && DEMO_IDS.has(ad.id)) continue;
    if (DRY_RUN) {
      console.log(`  + anuncio ${ad.name}`);
      continue;
    }
    const { error } = await admin.from("ad_creatives").insert({
      user_id: uid,
      product_id: productIdMap.get(ad.relatedProductId) ?? null,
      name: ad.name,
      brand: ad.brand ?? "",
      kind: ad.type ?? "own",
      platform: ad.platform ?? "",
      country: ad.country ?? "",
      tags: ad.tags ?? [],
      status: ad.status ?? "pending",
    });
    console.log(error ? `  ✗ anuncio ${ad.name}: ${error.message}` : `  + anuncio ${ad.name}`);
  }

  for (const analysis of analyses) {
    if (!INCLUDE_DEMO && DEMO_IDS.has(analysis.id)) continue;
    if (DRY_RUN) {
      console.log(`  + análisis ${analysis.title}`);
      continue;
    }
    const { error } = await admin.from("analyses").insert({
      user_id: uid,
      product_id: productIdMap.get(analysis.productId) ?? null,
      title: analysis.title,
      kind: analysis.type ?? "analysis",
      status: analysis.status ?? "draft",
      summary: analysis.summary ?? "",
    });
    console.log(
      error ? `  ✗ análisis ${analysis.title}: ${error.message}` : `  + análisis ${analysis.title}`,
    );
  }

  /*
   * El rendimiento apuntaba a copys y anuncios que vivían en los fixtures y no
   * existen en la base. Importarlo dejaría valoraciones colgando de un id que
   * no lleva a ninguna parte, así que se dice y se deja fuera.
   */
  const orphanPerformance = performance.filter((record) => !productIdMap.has(record.productId));
  if (orphanPerformance.length > 0) {
    console.log(
      `  – ${orphanPerformance.length} valoración(es) de rendimiento omitidas: apuntaban a copys de demostración que no existen en la base.`,
    );
  }

  /* Claves de proveedor ---------------------------------------------------- */

  const providerConfig = readJson("settings/provider-config.json", null);

  console.log("\nClaves de API");
  if (!providerConfig) {
    console.log("  (no había ninguna guardada)");
  } else if (DRY_RUN) {
    console.log("  + configuración de proveedores");
  } else {
    const { error } = await admin.from("provider_configs").upsert(
      {
        user_id: uid,
        active_provider: providerConfig.activeProvider ?? "claude",
        anthropic_api_key: providerConfig.claudeApiKey || null,
        chatgpt_api_key: providerConfig.chatgptApiKey || null,
        claude_model: providerConfig.claudeModel ?? "claude-opus-5",
        claude_copy_model: providerConfig.claudeCopyModel ?? "claude-sonnet-5",
        chatgpt_model: providerConfig.chatgptModel ?? "",
        higgsfield_key_id: providerConfig.higgsfieldKeyId || null,
        higgsfield_key_secret: providerConfig.higgsfieldKeySecret || null,
      },
      { onConflict: "user_id", defaultToNull: false },
    );

    if (error) {
      console.log(`  ✗ ${error.message}`);
    } else {
      // Nunca se imprime el valor, solo qué quedó configurado.
      const configured = [
        providerConfig.claudeApiKey ? "Claude" : "",
        providerConfig.chatgptApiKey ? "ChatGPT" : "",
        providerConfig.higgsfieldKeyId ? "Higgsfield" : "",
      ].filter(Boolean);
      console.log(`  + ${configured.join(", ") || "sin claves"}`);
    }
  }

  console.log(
    DRY_RUN
      ? "\nModo seco: no se ha escrito nada. Quita --seco para hacerlo de verdad."
      : "\nListo. Los archivos de data/ y settings/ siguen intactos por si hace falta repetirlo.",
  );
}

main().catch((error) => {
  console.error(`Falló la importación: ${error.message}`);
  process.exit(1);
});
