import "server-only";

import { hasHiggsfieldCredentials } from "@/lib/provider-config";
import { listImageModels } from "@/lib/higgsfield";
import { cliStatus, listCliModels, modelAcceptsReferences } from "@/lib/higgsfield-cli";
import type { CatalogModel } from "@/types/higgsfield-catalog";

/**
 * Los modelos de imagen de las dos vías de Higgsfield, en una sola lista.
 *
 * Higgsfield son dos productos con catálogos distintos y credenciales distintas:
 * la API de clave (`platform.higgsfield.ai`) y el CLI con sesión de navegador.
 * **Nano Banana Pro y las imágenes de referencia solo existen en la segunda**,
 * comprobado sondeando la primera con 56 nombres candidatos.
 *
 * Se juntan aquí porque al usuario no le importa esa separación: quiere elegir
 * un modelo. Lo que sí cambia es qué puede hacer cada uno, y eso viaja en
 * `acceptsReferences` para que la interfaz avise antes de gastar créditos.
 *
 * Ninguna de las dos vías tumba a la otra: si el CLI no tiene sesión, siguen
 * saliendo los de la API, y al revés.
 */

/**
 * Nano Banana Pro primero, el resto detrás.
 *
 * Es el que el usuario pidió por su nombre y el que acepta hasta 14 referencias;
 * enterrado en una lista alfabética de cuarenta entradas no lo encontraría.
 */
function rank(model: CatalogModel): number {
  if (model.slug.startsWith("nano_banana")) return 0;
  if (model.acceptsReferences !== false) return 1;
  return 2;
}

export interface Catalog {
  models: CatalogModel[];
  /** Por qué falta una de las dos vías, si falta. Se enseña, no se esconde. */
  warnings: string[];
}

export async function readCatalog(): Promise<Catalog> {
  const warnings: string[] = [];
  const models: CatalogModel[] = [];

  // Las dos a la vez: son dos redes distintas y en serie se suman las esperas.
  const [api, cli] = await Promise.allSettled([
    (async () => {
      if (!(await hasHiggsfieldCredentials())) {
        throw new Error(
          "Sin credenciales de API de Higgsfield: no salen sus modelos. Añádelas en Configuración.",
        );
      }
      return listImageModels();
    })(),
    (async () => {
      const status = await cliStatus();
      if (!status.installed || !status.authenticated) {
        throw new Error(status.reason ?? "El CLI de Higgsfield no está disponible.");
      }
      return listCliModels();
    })(),
  ]);

  if (api.status === "fulfilled") {
    models.push(
      ...api.value.map((model) => ({
        slug: model.slug,
        title: model.title,
        source: "api" as const,
        credits: model.baseCredits,
        // La API ignora en silencio los campos que no reconoce, así que aquí no
        // se promete lo que no se ha podido comprobar.
        acceptsReferences: false,
      })),
    );
  } else {
    warnings.push(api.reason instanceof Error ? api.reason.message : String(api.reason));
  }

  if (cli.status === "fulfilled") {
    models.push(
      ...cli.value.map((model) => ({
        slug: model.slug,
        title: model.title,
        source: "cli" as const,
        credits: null,
        acceptsReferences: model.acceptsReferences,
      })),
    );
  } else {
    warnings.push(cli.reason instanceof Error ? cli.reason.message : String(cli.reason));
  }

  models.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));

  return { models, warnings };
}

/**
 * Resuelve si el modelo elegido acepta la foto del producto.
 *
 * El listado no siempre trae los parámetros de cada modelo; cuando no los trae,
 * se le pregunta por este en concreto. Es una sola llamada, y solo por la vía
 * del CLI: la API de clave acepta en silencio los campos que no reconoce, cobra
 * los créditos y devuelve una imagen sin la referencia, así que allí no hay nada
 * que preguntar.
 */
export async function resolveReferenceSupport(model: CatalogModel): Promise<boolean> {
  if (model.source !== "cli") return false;
  if (model.acceptsReferences !== null) return model.acceptsReferences;

  try {
    return await modelAcceptsReferences(model.slug);
  } catch {
    // Un fallo aquí no debe impedir generar: se genera sin referencia.
    return false;
  }
}
