"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { findNodeType, type NodeState, type PortKind } from "@/lib/flow/graph";

/**
 * Una caja del lienzo.
 *
 * ## Los puertos se ven y se distinguen
 *
 * Cada entrada es un punto con su nombre al lado, y el color dice qué acepta.
 * Sin eso, conectar es adivinar: dos puntos iguales en el borde izquierdo no
 * dicen cuál es el prompt y cuál las referencias, y equivocarse manda la imagen
 * al hueco del texto — que no da error, da un resultado raro.
 *
 * ## El color por tipo, no por bonito
 *
 * Es la única pista de qué encaja con qué antes de intentarlo. Se elige por el
 * tipo de dato y se repite en la salida, así que dos puntos del mismo color se
 * pueden unir y dos de distinto no.
 */

const PORT_COLOR: Record<PortKind, string> = {
  texto: "#8b5cf6",
  imagen: "#0ea5e9",
  video: "#f43f5e",
  audio: "#10b981",
  guion: "#f59e0b",
  producto: "#64748b",
};

const GROUP_STYLE: Record<string, string> = {
  fuente: "border-slate-300 dark:border-slate-700",
  idea: "border-amber-300 dark:border-amber-800",
  produccion: "border-sky-300 dark:border-sky-800",
  montaje: "border-rose-300 dark:border-rose-800",
};

export interface FlowNodeData extends Record<string, unknown> {
  type: string;
  /** Qué hay dentro: el modelo elegido, el texto, lo que sea. */
  summary: string;
  /**
   * Lo que ya está puesto, antes de ejecutar nada.
   *
   * La imagen que se elige en el panel se ve **en el momento**, no cuando se
   * ejecuta el flujo. Antes solo se pintaba el resultado de la última vuelta, y
   * elegir una foto del producto no cambiaba nada en pantalla: parecía que el
   * clic no había hecho nada, y la forma de comprobarlo era ejecutar. Eso son
   * varios minutos y varias generaciones para saber si acertaste con la foto.
   */
  preview?: { url: string; text: string };
  /** Lo que produjo la última ejecución, si la hubo. */
  result?: { url: string; kind: string; error: string };
  /** En qué anda mientras el flujo corre. */
  state?: NodeState;
}

/**
 * Cómo se ve cada estado.
 *
 * El que está en marcha late, y los que esperan se apagan. Sin eso, un flujo de
 * doce nodos ejecutándose se ve exactamente igual que uno parado: la única
 * señal era una frase debajo del lienzo, y hay que ir a buscarla mientras se
 * mira la caja que interesa.
 */
const STATE_STYLE: Record<NodeState, { ring: string; label: string; tone: string }> = {
  ahora: {
    ring: "border-violet-500 ring-4 ring-violet-200 dark:ring-violet-900",
    label: "Trabajando",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  },
  hecho: {
    ring: "border-emerald-400",
    label: "Hecho",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  fallo: {
    ring: "border-rose-500",
    label: "Falló",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  },
  parado: {
    ring: "border-slate-300 dark:border-slate-700",
    label: "No se intentó",
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  espera: {
    ring: "",
    label: "En cola",
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

export function FlowNodeBox({ data, selected }: NodeProps) {
  const value = data as FlowNodeData;
  const type = findNodeType(value.type);

  if (!type) {
    return (
      <div className="rounded-xl border border-rose-400 bg-rose-50 px-3 py-2 text-xs">
        «{value.type}» no existe
      </div>
    );
  }

  const result = value.result;
  const state = value.state ? STATE_STYLE[value.state] : null;

  return (
    <div
      className={`w-52 rounded-2xl border-2 bg-white shadow-sm transition-shadow dark:bg-slate-900 ${
        selected
          ? "border-violet-500"
          : state?.ring || GROUP_STYLE[type.group] || "border-slate-300"
      } ${value.state === "espera" || value.state === "parado" ? "opacity-60" : ""}`}
    >
      {/*
        Las entradas, repartidas por la altura y con su nombre dentro.

        El nombre va **dentro de la caja** y no flotando al lado: en un lienzo
        con veinte nodos, las etiquetas sueltas se pisan con las de al lado y
        acaban ilegibles justo cuando más nodos hay.
      */}
      {type.accepts.map((input, index) => (
        <Handle
          key={input.label}
          id={String(index)}
          type="target"
          position={Position.Left}
          style={{
            top: 44 + index * 20,
            width: 10,
            height: 10,
            background: PORT_COLOR[input.kind],
            border: "2px solid white",
          }}
        />
      ))}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          top: 24,
          width: 10,
          height: 10,
          background: PORT_COLOR[type.produces],
          border: "2px solid white",
        }}
      />

      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">{type.group}</p>

          {state ? (
            <span
              className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${state.tone}`}
            >
              {/*
                El punto que late solo en el que está trabajando. En los demás es
                un punto quieto: una animación en doce cajas a la vez dice que
                hay doce cosas pasando, y solo pasa una.
              */}
              {value.state === "ahora" ? (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-violet-600" />
                </span>
              ) : null}
              {state.label}
            </span>
          ) : null}
        </div>

        <p className="text-sm font-medium">{type.label}</p>

        {type.accepts.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {type.accepts.map((input) => (
              <li key={input.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span
                  aria-hidden
                  className="inline-block size-1.5 rounded-full"
                  style={{ background: PORT_COLOR[input.kind] }}
                />
                {input.label}
                {input.required ? "" : " (opcional)"}
              </li>
            ))}
          </ul>
        ) : null}

        {value.summary ? (
          <p className="mt-1 truncate text-[11px] text-slate-600 dark:text-slate-300">
            {value.summary}
          </p>
        ) : null}

        {/*
          Lo que ya está puesto, en cuanto se pone.

          Va **antes** que el resultado y solo cuando no hay resultado: en cuanto
          la vuelta produce algo, lo que manda es lo que salió. Sin recortar, por
          lo mismo que el resultado: una miniatura recortada de un vertical
          enseña la franja del medio, justo donde no está ni la cara ni el envase.
        */}
        {!result?.url && value.preview?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={value.preview.url}
            alt=""
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800"
          />
        ) : null}

        {!result?.url && value.preview?.text ? (
          <p className="mt-1 line-clamp-4 rounded-lg bg-slate-50 px-1.5 py-1 text-[10px] leading-snug text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {value.preview.text}
          </p>
        ) : null}

        {/*
          Lo que salió, en la propia caja.

          Es lo que convierte el lienzo en algo que se puede depurar: ver el
          fallo en el nodo que lo tuvo, en vez de leer un resumen al final que
          dice «falló algo».
        */}
        {result?.error ? (
          <p className="mt-1 rounded-lg bg-rose-50 px-1.5 py-1 text-[10px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {result.error.slice(0, 90)}
          </p>
        ) : null}

        {/*
          Sin recortar.

          Estaba con `object-cover` y una altura fija, que de un vertical enseña
          la franja del medio: justo donde no está ni la cara ni el envase. Una
          miniatura recortada no sirve para decidir si la toma vale, que es para
          lo que se mira.

          Ahora la caja se estira a lo que ocupe la imagen. Un flujo con veinte
          nodos se hace más alto y se compensa con el zoom, que para eso está.
        */}
        {result?.url && result.kind === "imagen" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={result.url} alt="" className="mt-1 w-full rounded-lg" />
        ) : null}

        {result?.url && result.kind === "video" ? (
          <video
            key={result.url}
            src={result.url}
            controls
            playsInline
            preload="metadata"
            className="nodrag mt-1 w-full rounded-lg bg-slate-100 dark:bg-slate-800"
          />
        ) : null}

        {result?.url && result.kind === "audio" ? (
          <audio key={result.url} src={result.url} controls className="mt-1 h-8 w-full" />
        ) : null}

        {/*
          Abrir y descargar, cada pieza por su cuenta.

          La descarga pasa por la plataforma porque desde otro dominio el
          atributo `download` **no hace nada**: el navegador lo ignora y abre el
          vídeo en una pestaña. Quien quiere el archivo acaba con un clic derecho
          y un nombre como `a3f9b2c1-4d5e.mp4`.

          `nodrag` en los dos: sin él, el lienzo se queda el clic para arrastrar
          la caja y el enlace no llega a abrirse nunca.
        */}
        {result?.url ? (
          <div className="mt-1 flex gap-2 text-[10px]">
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="nodrag text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
            >
              Abrir
            </a>

            <a
              href={`/api/descargar?url=${encodeURIComponent(result.url)}`}
              className="nodrag text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
            >
              Descargar
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
