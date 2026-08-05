/**
 * Qué se ve de un nodo sin abrirlo: su resumen y lo que ya tiene puesto.
 *
 * Vive aparte del lienzo porque lo necesitan los dos: el lienzo, al construir
 * las cajas y al cambiar los ajustes desde el panel; y la caja misma, cuando el
 * prompt se escribe dentro de ella. Dejarlo en el lienzo obligaba a que la caja
 * importara al lienzo que la dibuja, que es un círculo.
 */

import { findNodeType } from "@/lib/flow/graph";

/** Lo que identifica un nodo de un vistazo. */
export function summaryOf(type: string, settings: Record<string, unknown>): string {
  const node = findNodeType(type);
  if (!node) return "";

  const get = (key: string) => (typeof settings[key] === "string" ? (settings[key] as string) : "");

  // Lo que identifica ese nodo de un vistazo, que no es lo mismo en todos.
  const pieces =
    type === "archivo"
      ? [get("name") || (get("url") ? "imagen puesta" : "")]
      : type === "avatar"
        ? [get("avatarId") ? "cara fijada" : "la de cada vuelta"]
        : type === "referencia"
          ? [get("label") || (get("text") ? "texto puesto" : "")]
        : type === "copy"
          ? [get("format") || "anuncio"]
          : type === "anuncio"
            ? [get("model") || "seedance2", get("director")]
            : [get("text").slice(0, 40), get("model")];

  return pieces.filter(Boolean).join(" · ");
}

/**
 * Lo que ya está puesto en el nodo, para verlo sin ejecutar nada.
 *
 * Es la mitad visible de un fallo que costaba caro: elegir una foto del
 * producto en el panel no cambiaba nada en el lienzo, así que parecía que el
 * clic no había hecho nada — y la única forma de comprobar si estaba bien
 * elegida era ejecutar el flujo entero.
 */
export function previewOf(
  type: string,
  settings: Record<string, unknown>,
): { url: string; text: string } | undefined {
  const get = (key: string) => (typeof settings[key] === "string" ? (settings[key] as string) : "");

  if (type === "archivo" && get("url")) return { url: get("url"), text: "" };
  if (type === "avatar" && get("avatarUrl")) return { url: get("avatarUrl"), text: "" };
  if (type === "prompt" && get("text")) return { url: "", text: get("text") };
  if (type === "referencia" && get("text")) return { url: "", text: get("text") };
  if (type === "copy" && get("angle")) return { url: "", text: get("angle") };
  if (type === "musica" && get("prompt")) return { url: "", text: get("prompt") };

  return undefined;
}
