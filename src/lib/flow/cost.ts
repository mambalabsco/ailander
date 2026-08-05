/**
 * Lo que cuesta ejecutar un flujo, antes de ejecutarlo.
 *
 * Probado en `cost.test.ts`. Solo importa tablas puras, así que se puede probar
 * sin llamar a nadie.
 *
 * ## Por qué antes y no después
 *
 * Porque después ya está pagado. Un lienzo con doce nodos —seis clips, seis
 * imágenes, voz, música y montaje— puede costar unos céntimos o varios dólares
 * según qué generador tenga cada caja, y eso no se ve mirando el dibujo. Pulsar
 * «ejecutar» sin saberlo es la forma de descubrir el precio en la factura.
 *
 * ## Solo lo que falta
 *
 * Se cuenta lo que **no está hecho**. Continuar una vuelta con nueve pasos
 * hechos cuesta lo que valen los tres que faltan, y enseñar el total del flujo
 * ahí sería mentir hacia arriba — justo el número que hace que alguien no le dé.
 *
 * ## Y los precios que no se saben, se dicen
 *
 * La tabla de generadores solo lleva los confirmados: un precio inventado es
 * peor que ninguno, porque se decide con él. Los nodos sin precio se cuentan
 * aparte y se enseñan como lo que son —«y N pasos sin precio confirmado»— en vez
 * de sumar cero y dar un total que parece completo.
 */

import { estimateCost, findGenerator } from "../video/catalog.ts";
import { findLipsyncModel, lipsyncCostUsd } from "../video/lipsync.ts";
import { findMusicGenerator, musicCost } from "../video/music.ts";
import { planSegments } from "../video/segments.ts";
import type { Flow, FlowNode } from "./graph.ts";

/**
 * Lo que cuesta una imagen.
 *
 * Es el precio de Nano Banana, que es el que usa la plataforma y el mismo que ya
 * se enseña en la pantalla de avatares. Va aquí como constante y no adivinado
 * por nodo: si cambia el generador, cambia en un sitio.
 */
export const IMAGE_USD = 0.02;

/**
 * Lo que cuesta una llamada de texto: guion, copy, prompt mejorado.
 *
 * No es un precio por unidad, es un orden de magnitud. Un guion de seis tomas
 * ronda esto; un copy corto, menos. Se cuenta porque no contarlo haría que un
 * flujo de puro texto saliera a cero, y cero es un número que se cree.
 */
export const TEXT_USD = 0.03;

export interface NodeCost {
  nodeId: string;
  /** Qué es, para poder leer la lista sin abrir cada caja. */
  what: string;
  /** `null` cuando el proveedor no publica el precio. */
  usd: number | null;
}

export interface FlowCost {
  items: NodeCost[];
  /** La suma de lo que sí se sabe. */
  usd: number;
  /** Cuántos pasos no tienen precio confirmado. */
  unknown: number;
  /** Cuántos se van a ejecutar. */
  steps: number;
  /** Cuántos se reutilizan de la vuelta anterior. */
  reused: number;
}

const num = (settings: Record<string, unknown>, key: string, fallback: number): number => {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const text = (settings: Record<string, unknown>, key: string, fallback = ""): string =>
  typeof settings[key] === "string" && settings[key] ? (settings[key] as string) : fallback;

/** Lo que cuesta un nodo suelto. */
export function nodeCost(node: FlowNode): NodeCost {
  switch (node.type) {
    case "imagen":
      return { nodeId: node.id, what: "Imagen", usd: IMAGE_USD };

    /*
      El lipsync se cobra por segundo de vídeo, y aquí todavía no se sabe
      cuántos: el vídeo lo produce el nodo de antes. Se estiman los mismos
      segundos que el clip trae por defecto para que la barra no mienta por
      omisión — un nodo a cero da a entender que es gratis, y no lo es.
    */
    case "labios": {
      const model = findLipsyncModel(text(node.settings, "model"));
      const seconds = num(node.settings, "seconds", 6);

      return {
        nodeId: node.id,
        what: `Lipsync · ${model.label} · ~${seconds} s`,
        usd: lipsyncCostUsd(model.id, seconds),
      };
    }

    case "clip": {
      const model = findGenerator(text(node.settings, "model"));
      const seconds = num(node.settings, "seconds", 6);

      return {
        nodeId: node.id,
        what: `Clip · ${model.label} · ${seconds} s`,
        usd: estimateCost(model, seconds),
      };
    }

    case "anuncio": {
      /*
       * Un anuncio largo son varias llamadas, y se cobran todas.
       *
       * Enseñar el precio de una pieza cuando se van a generar cuatro es el
       * error que más caro sale de todos los de esta pantalla.
       */
      const model = findGenerator(text(node.settings, "model", "seedance2"));
      const wanted = num(node.settings, "seconds", 15);

      const segments = planSegments({
        seconds: wanted,
        maxSeconds: model.maxSeconds,
        minSeconds: model.minSeconds,
        durations: model.durations,
      });

      const each = estimateCost(model, segments[0].seconds);

      return {
        nodeId: node.id,
        what: `Anuncio · ${model.label} · ${segments.length > 1 ? `${segments.length} tramos de ` : ""}${segments[0].seconds} s`,
        usd: each === null ? null : Number((each * segments.length).toFixed(2)),
      };
    }

    case "musica": {
      const model = findMusicGenerator(text(node.settings, "model"));
      const seconds = num(node.settings, "seconds", 30);

      return {
        nodeId: node.id,
        what: `Música · ${model.label} · ${seconds} s`,
        usd: musicCost(model, seconds),
      };
    }

    case "voz":
      // ElevenLabs cobra por caracteres del plan contratado, no por llamada: lo
      // que gasta no es un precio en dólares que se pueda poner aquí.
      return { nodeId: node.id, what: "Voz", usd: null };

    case "guion":
    case "copy":
      return { nodeId: node.id, what: node.type === "copy" ? "Copy" : "Guion", usd: TEXT_USD };

    case "montaje":
      // Montar son unos céntimos de proceso, no de modelo. Redondea a cero y
      // ponerle un número sería inventarlo.
      return { nodeId: node.id, what: "Montaje", usd: 0 };

    default:
      // Producto, avatar, archivo, prompt, referencia: no llaman a nadie.
      return { nodeId: node.id, what: "", usd: 0 };
  }
}

/**
 * Lo que cuesta lo que falta por ejecutar.
 *
 * `done` son los nodos que se van a reutilizar de la vuelta anterior. Sin
 * ninguno, es lo que cuesta el flujo entero — que es lo que vale para «empezar
 * de cero».
 */
export function flowCost(flow: Flow, done: Set<string> = new Set()): FlowCost {
  const items: NodeCost[] = [];
  let usd = 0;
  let unknown = 0;
  let steps = 0;

  for (const node of flow.nodes) {
    if (done.has(node.id)) continue;

    const cost = nodeCost(node);

    // Los que no llaman a nadie no salen en la lista: llenarla de ceros esconde
    // los tres que sí cuestan.
    if (!cost.what) continue;

    steps += 1;
    items.push(cost);

    if (cost.usd === null) unknown += 1;
    else usd += cost.usd;
  }

  return {
    items,
    usd: Number(usd.toFixed(2)),
    unknown,
    steps,
    reused: flow.nodes.filter((node) => done.has(node.id)).length,
  };
}

/** Cómo contarlo en una línea. */
export function costLabel(cost: FlowCost): string {
  if (cost.steps === 0) return "No queda nada por generar.";

  const parts = [
    cost.usd > 0 ? `Unos ${cost.usd.toFixed(2)} USD` : "Menos de un céntimo",
    ` por ${cost.steps} paso${cost.steps === 1 ? "" : "s"}`,
  ];

  if (cost.unknown > 0) {
    parts.push(
      `, y ${cost.unknown} sin precio confirmado (${cost.unknown === 1 ? "lo verás" : "los verás"} en tu factura)`,
    );
  }

  if (cost.reused > 0) parts.push(`. ${cost.reused} ya hechos no se vuelven a pagar`);

  return `${parts.join("")}.`;
}
