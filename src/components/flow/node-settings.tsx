"use client";

import { useRef, useState } from "react";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import type { LaunchResult } from "@/types/jobs";
import { findNodeType } from "@/lib/flow/graph";
import { LIPSYNC_MODELS, SYNC_MODES, findLipsyncModel } from "@/lib/video/lipsync";
import { IMAGE_GENERATORS, VIDEO_GENERATORS, durationLabel, findGenerator, nearestDuration } from "@/lib/video/catalog";
import { MUSIC_GENERATORS } from "@/lib/video/music";
import { MUSIC_LEVELS } from "@/lib/video/loudness";
import { VOICE_PRESETS } from "@/lib/video/voice-settings";
import { SUBTITLE_PRESETS } from "@/lib/video/captions";
import { ASPECTS } from "@/lib/video/aspect";
import { PEOPLE } from "@/lib/avatar-shots";
import { generateAvatarsAction } from "@/app/avatares/actions";
import { uploadFlowImageAction } from "@/app/flujos/actions";
import { polishPromptAction } from "@/app/estudio/actions";
import { COPY_FORMATS } from "@/lib/flow/copy";
import { DIRECTOR_TEMPLATES } from "@/lib/video/director";

/**
 * Los ajustes del nodo seleccionado.
 *
 * ## Por qué a un lado y no dentro de la caja
 *
 * Una caja con seis campos dentro deja de ser un nodo y pasa a ser un
 * formulario: ocupa media pantalla, tapa las conexiones y hace ilegible el
 * dibujo, que es justo lo que el lienzo venía a aportar. Fuera, la caja dice
 * qué es y el panel dice cómo está.
 *
 * ## Y solo lo que ese nodo usa
 *
 * Cada tipo enseña sus campos y ninguno más. Un desplegable de modelos de vídeo
 * en un nodo de música es una invitación a cambiarlo y preguntarse por qué no
 * pasa nada — el ejecutor no lo mira.
 */

export interface NodeSettingsProps {
  nodeId: string;
  type: string;
  settings: Record<string, unknown>;
  voices: { id: string; name: string }[];
  avatars: { id: string; name: string; url: string }[];
  /** Las del producto del flujo, para usarlas de referencia. */
  productImages: { url: string; name: string; primary: boolean }[];
  /** Los modelos del CLI, para poder crear una cara sin salir del lienzo. */
  cliModels: { slug: string; name: string }[];
  cliModelsError: string;
  /** Los de vídeo de Higgsfield, para los nodos de clip. */
  cliVideoModels: { slug: string; name: string }[];
  /** Los copys que ya funcionaron y los ángulos investigados del producto. */
  copyReferences: { id: string; kind: "copy" | "angulo"; label: string; text: string }[];
  onChange: (settings: Record<string, unknown>) => void;
  onDelete: () => void;
  /** Copiar este nodo con sus ajustes, sin sus conexiones. */
  onDuplicate: () => void;
  /** Seguir desde el final del vídeo que produjo este nodo. */
  onContinue: (mode: "mas" | "voz" | "traducir") => void;
  /** Si este nodo ya produjo un vídeo. */
  hasVideo: boolean;
  /** Varias fotos de golpe: cada una entra como su propio nodo de imagen. */
  onAddImages: (images: { url: string; name: string }[]) => void;
  /** Se avisa al lanzar caras nuevas, para que el lienzo empiece a sondear. */
  onFacesChanged: () => void;
  /**
   * Rehacer solo este paso. Sin definir cuando el nodo no ha producido nada:
   * rehacer lo que no se ha hecho es ejecutar, y para eso está el otro botón.
   */
  onRedo?: () => Promise<LaunchResult>;
}

const text = (settings: Record<string, unknown>, key: string): string =>
  typeof settings[key] === "string" ? (settings[key] as string) : "";

const number = (settings: Record<string, unknown>, key: string, fallback: number): number => {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function NodeSettings({
  nodeId,
  type,
  settings,
  voices,
  avatars,
  productImages,
  cliModels,
  cliModelsError,
  cliVideoModels,
  copyReferences,
  onChange,
  onDelete,
  onDuplicate,
  onContinue,
  hasVideo,
  onAddImages,
  onFacesChanged,
  onRedo,
}: NodeSettingsProps) {
  const node = findNodeType(type);
  if (!node) return null;

  const set = (key: string, value: unknown) => onChange({ ...settings, [key]: value });

  const field = (label: string, control: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      {control}
    </label>
  );

  const input = (key: string, placeholder: string) => (
    <input
      value={text(settings, key)}
      onChange={(event) => set(key, event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
    />
  );

  const seconds = (key: string, fallback: number, max = 30) =>
    field(
      "Segundos",
      <input
        type="number"
        min={1}
        max={max}
        value={number(settings, key, fallback)}
        onChange={(event) => set(key, Number(event.target.value))}
        className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />,
    );

  const aspect = () =>
    field(
      "Forma",
      <SelectField
        value={text(settings, "aspectRatio") || "9:16"}
        onChange={(event) => set("aspectRatio", event.target.value)}
      >
        {ASPECTS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label} · {item.id}
          </option>
        ))}
      </SelectField>,
    );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{node.label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {nodeId} · {node.note}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={onDuplicate}>
            Duplicar
          </Button>

          <Button variant="ghost" onClick={onDelete}>
            Quitar
          </Button>
        </div>
      </div>

      {/*
        Rehacer este paso y lo que colgaba de él.

        Volver a generar la imagen sin tirar el clip que salió de ella daría un
        montaje con la imagen nueva en la caja y la vieja dentro del vídeo, y eso
        no se ve hasta reproducirlo entero.
      */}
      {onRedo ? (
        <GenerateButton
          action={onRedo}
          label="Rehacer este paso"
          hint="Se vuelve a generar este nodo y lo que dependía de él. Lo demás se reutiliza."
        />
      ) : null}

      {type === "prompt" ? (
        <div className="space-y-2">
          {field(
            "Qué se le pide",
            <textarea
              value={text(settings, "text")}
              onChange={(event) => set("text", event.target.value)}
              rows={4}
              placeholder="Close-up del envase sobre mármol, luz de mañana…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />,
          )}

          {/*
            Escribirlo con Claude.

            Un generador de vídeo no entiende intenciones, entiende planos:
            «que se vea bonito el producto» no le dice nada y «close-up, bottle
            centred, slow push-in, warm morning light» le dice qué renderizar.
            La distancia entre esas dos frases es un clip fallido, y cada clip
            fallido son varios dólares.
          */}
          <WriteWithClaude
            draft={text(settings, "text")}
            onWritten={(prompt) => set("text", prompt)}
          />
        </div>
      ) : null}

      {type === "archivo" ? (
        <ImageSource
          url={text(settings, "url")}
          productImages={productImages}
          onPick={(url, name) => onChange({ ...settings, url, name })}
          onAddImages={onAddImages}
        />
      ) : null}

      {type === "avatar" ? (
        <div className="space-y-2">
          {/*
            Miniaturas y no un desplegable de nombres.

            Una cara se elige mirándola. Con nombres como «mujer de 45 cansada
            2» hay que abrir otra pantalla para saber cuál es cuál, y al volver
            el lienzo ha perdido lo que no estaba guardado.
          */}
          <p className="text-xs text-slate-500 dark:text-slate-400">Qué cara</p>

          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => onChange({ ...settings, avatarId: "", avatarUrl: "" })}
              className={`flex aspect-square items-center justify-center rounded-lg border p-1 text-[9px] leading-tight ${
                text(settings, "avatarId") === ""
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                  : "border-slate-300 dark:border-slate-700"
              }`}
            >
              {/*
                Vacío no es un descuido: es «la que diga la vuelta». Es lo que
                permite ejecutar el mismo flujo con seis caras distintas.
              */}
              La de cada vuelta
            </button>

            {avatars.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                title={avatar.name}
                // La dirección se guarda también para poder pintar la cara en la
                // caja sin tener que ejecutar nada.
                onClick={() => onChange({ ...settings, avatarId: avatar.id, avatarUrl: avatar.url })}
                className={`overflow-hidden rounded-lg border ${
                  text(settings, "avatarId") === avatar.id
                    ? "border-violet-500 ring-2 ring-violet-300"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar.url} alt={avatar.name} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>

          {/*
            Crear una cara sin salir del lienzo.

            Descubrir a mitad de montar un flujo que falta una cara y tener que
            irse a otra pantalla es perder el hilo — y al volver, el lienzo se
            ha recargado y lo no guardado se ha ido.
          */}
          <NewFace models={cliModels} error={cliModelsError} onLaunched={onFacesChanged} />
        </div>
      ) : null}

      {type === "referencia" ? (
        <PickReference
          items={copyReferences}
          text={text(settings, "text")}
          label={text(settings, "label")}
          onPick={(label, value) => onChange({ ...settings, label, text: value })}
        />
      ) : null}

      {type === "copy" ? (
        <div className="space-y-2">
          {field(
            "Qué se escribe",
            <SelectField
              value={text(settings, "format") || "anuncio"}
              onChange={(event) => set("format", event.target.value)}
            >
              {COPY_FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </SelectField>,
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {COPY_FORMATS.find((format) => format.id === (text(settings, "format") || "anuncio"))
              ?.note ?? ""}
          </p>

          {field(
            "Por qué ángulo va",
            <textarea
              value={text(settings, "angle")}
              onChange={(event) => set("angle", event.target.value)}
              rows={2}
              placeholder="Para quien ya probó colágeno y no notó nada…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />,
          )}

          {/*
            Los ángulos ya investigados, sin salir del lienzo.

            Estaban en la ficha del producto y aquí no llegaban: había que
            abrirla en otra pestaña y copiarlos a mano, y al volver el lienzo
            había perdido lo no guardado.
          */}
          {copyReferences.some((item) => item.kind === "angulo") ? (
            <SelectField
              value=""
              onChange={(event) => {
                if (event.target.value) set("angle", event.target.value);
              }}
            >
              <option value="">Traer un ángulo investigado…</option>
              {copyReferences
                .filter((item) => item.kind === "angulo")
                .map((item) => (
                  <option key={item.id} value={item.text}>
                    {item.label}
                  </option>
                ))}
            </SelectField>
          ) : null}

          {/*
            Los segundos solo cuando se va a locutar: en un texto de Meta no
            significan nada y un campo que no hace nada se rellena igual.
          */}
          {text(settings, "format") === "voz" ? seconds("seconds", 30, 180) : null}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Si le enchufas un prompt al ángulo, manda ese: es lo que permite lanzar el mismo flujo
            con cinco ángulos sin tocar la caja.
          </p>
        </div>
      ) : null}

      {type === "guion" ? (
        <div className="grid grid-cols-2 gap-2">
          {field(
            "Cuántas tomas",
            <input
              type="number"
              min={3}
              max={12}
              value={number(settings, "shots", 6)}
              onChange={(event) => set("shots", Number(event.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />,
          )}
          {seconds("seconds", 45, 180)}
        </div>
      ) : null}

      {type === "imagen" ? (
        <div className="space-y-2">
          {field(
            "Con qué modelo",
            <SelectField
              value={text(settings, "model")}
              onChange={(event) => set("model", event.target.value)}
            >
              {IMAGE_GENERATORS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}

              {/*
                Los de Higgsfield, en el mismo desplegable.

                Van por su CLI y no por la API, pero eso es un detalle de cómo
                se genera, no de qué se elige: separarlos en dos listas obliga a
                saber por dónde va cada modelo para encontrarlo.
              */}
              {cliModels.length > 0 ? (
                <optgroup label="Higgsfield">
                  {cliModels.map((model) => (
                    <option key={model.slug} value={model.slug}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </SelectField>,
          )}

          {aspect()}
        </div>
      ) : null}

      {/*
        El conector del final.

        Un vídeo terminado no es el final del trabajo: casi siempre hay que
        seguir la escena, cambiarle la voz o sacarlo en otro idioma. Antes eso
        eran cinco nodos colocados y conectados a mano, y el que más se olvidaba
        —el ancla del fotograma final— es justo el que evita que en el plano
        siguiente salga otra persona.

        Solo aparece cuando hay vídeo: enseñarlo antes ofrecería continuar algo
        que todavía no existe.
      */}
      {hasVideo ? (
        <div className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seguir desde el final de este vídeo
          </p>

          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" onClick={() => onContinue("mas")}>
              Más vídeo
            </Button>

            <Button variant="ghost" onClick={() => onContinue("voz")}>
              Cambiar la voz
            </Button>

            <Button variant="ghost" onClick={() => onContinue("traducir")}>
              Traducir
            </Button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            «Más vídeo» saca el último fotograma y lo deja de ancla, para que no
            cambie la persona. Los otros dos no regeneran el vídeo: le cambian la
            boca con lipsync.
          </p>
        </div>
      ) : null}

      {type === "labios" ? (
        <div className="space-y-2">
          {field(
            "Con qué modelo",
            <SelectField
              value={text(settings, "model") || "lipsync-2"}
              onChange={(event) => set("model", event.target.value)}
            >
              {LIPSYNC_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {(model.usdPerSecond * 60).toFixed(2)} USD/min
                </option>
              ))}
            </SelectField>,
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {findLipsyncModel(text(settings, "model")).note}
          </p>

          {/*
            El modo se elige, no se hereda.

            El que trae la API por defecto recorta al más corto de los dos, y lo
            que se pierde es el final de la locución — que es donde está la
            llamada a la acción. Se pone «remap» delante y se explica cada uno.
          */}
          {field(
            "Si el audio y el vídeo no duran lo mismo",
            <SelectField
              value={text(settings, "syncMode") || "remap"}
              onChange={(event) => set("syncMode", event.target.value)}
            >
              {SYNC_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </SelectField>,
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {SYNC_MODES.find((mode) => mode.id === (text(settings, "syncMode") || "remap"))?.note ??
              ""}
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.detectOcclusion === true}
              onChange={(event) => set("detectOcclusion", event.target.checked)}
            />
            Hay algo que tapa la cara (una mano, el envase, un micro)
          </label>
        </div>
      ) : null}

      {type === "clip" || type === "anuncio" ? (
        <div className="space-y-2">
          {field(
            "Con qué modelo",
            <SelectField
              value={text(settings, "model") || (type === "anuncio" ? "seedance2" : "")}
              onChange={(event) => set("model", event.target.value)}
            >
              {VIDEO_GENERATORS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}

              {/*
                Los de Higgsfield llevan `hf:` delante, igual que en el estudio.
                Es lo que distingue «va por la API» de «va por su CLI», que no
                es lo mismo ni acepta los mismos campos.
              */}
              {type === "clip" && cliVideoModels.length > 0 ? (
                <optgroup label="Higgsfield">
                  {cliVideoModels.map((model) => (
                    <option key={model.slug} value={`hf:${model.slug}`}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </SelectField>,
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {VIDEO_GENERATORS.find(
              (model) => model.id === (text(settings, "model") || (type === "anuncio" ? "seedance2" : "")),
            )?.note ?? ""}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {/*
              Los segundos que ese generador vende, no un campo libre.

              Aquí estaba el fallo que sacó un anuncio acelerado: se tecleó 50 en
              Seedance, que llega a 15. El proveedor recorta sin decir nada y la
              dirección seguía pidiendo 50 segundos de historia, así que salió
              todo el guion metido en un tercio del tiempo.
            */}
            <ClipSeconds
              model={text(settings, "model") || (type === "anuncio" ? "seedance2" : "")}
              value={number(settings, "seconds", type === "anuncio" ? 15 : 6)}
              // El nodo de anuncio parte solo lo que no cabe en una pieza; el de
              // clip no, porque un clip **es** un plano.
              chains={type === "anuncio"}
              onChange={(next) => set("seconds", next)}
            />
            {aspect()}
          </div>

          {/*
            La dirección, solo en el nodo de una pieza.

            Un modelo que acepta veinte mil caracteres no necesita una frase:
            necesita la estructura del anuncio, el guion literal, cómo se rueda
            y qué no puede pasar. Mandarle solo el guion es desaprovecharlo — el
            guion dice lo que se oye, no lo que se ve, y sin estructura reparte
            las frases como quiere.
          */}
          {type === "anuncio" ? (
            <>
              {field(
                "Cómo se dirige",
                <SelectField
                  value={text(settings, "director")}
                  onChange={(event) => set("director", event.target.value)}
                >
                  <option value="">Solo el guion, sin estructura</option>
                  {DIRECTOR_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </SelectField>,
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {DIRECTOR_TEMPLATES.find((template) => template.id === text(settings, "director"))
                  ?.note ??
                  "Se manda el guion tal cual. Elige una forma y se manda además la estructura del anuncio, cómo se rueda y lo que no puede salir en pantalla."}
              </p>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={settings.sound === true || (type === "anuncio" && settings.sound !== false)}
              onChange={(event) => set("sound", event.target.checked)}
            />
            <span>Que genere sonido él mismo, donde el modelo sepa</span>
          </label>
        </div>
      ) : null}

      {type === "voz" ? (
        <div className="space-y-2">
          {field(
            "Qué voz",
            <SelectField
              value={text(settings, "voiceId")}
              onChange={(event) => set("voiceId", event.target.value)}
            >
              <option value="">Elige una…</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </SelectField>,
          )}

          {field(
            "Tono",
            <SelectField
              value={text(settings, "tone") || "cercano"}
              onChange={(event) => set("tone", event.target.value)}
            >
              {VOICE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </SelectField>,
          )}
        </div>
      ) : null}

      {type === "musica" ? (
        <div className="space-y-2">
          {field("Qué suena", input("prompt", "cálida y esperanzadora, sin voces"))}

          {field(
            "Generador",
            <SelectField
              value={text(settings, "model")}
              onChange={(event) => set("model", event.target.value)}
            >
              {MUSIC_GENERATORS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </SelectField>,
          )}

          <div className="grid grid-cols-2 gap-2">
            {field(
              "Volumen",
              <SelectField
                value={text(settings, "level") || "normal"}
                onChange={(event) => set("level", event.target.value)}
              >
                {MUSIC_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </SelectField>,
            )}
            {seconds("seconds", 30, 180)}
          </div>
        </div>
      ) : null}

      {type === "montaje"
        ? field(
            "Subtítulos",
            <SelectField
              value={text(settings, "subtitles")}
              onChange={(event) => set("subtitles", event.target.value)}
            >
              <option value="">Sin subtítulos</option>
              {SUBTITLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} — {preset.note}
                </option>
              ))}
            </SelectField>,
          )
        : null}

      {type === "producto" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tira del producto del flujo. Se cambia arriba, y con eso el mismo plano sirve para otro
          producto sin tocar ninguna caja.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Una cara nueva desde el propio lienzo.
 *
 * Va plegado: lo normal es elegir una que ya está, y un formulario de tres
 * campos abierto en el panel tapa los ajustes del nodo que sí se usan siempre.
 */
function NewFace({
  models,
  error,
  onLaunched,
}: {
  models: { slug: string; name: string }[];
  /** El motivo de que la lista venga vacía, si viene vacía. */
  error: string;
  onLaunched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [count, setCount] = useState(2);
  const [note, setNote] = useState("");

  // Soul primero: es el que hace personas que parecen personas.
  const sorted = [...models].sort(
    (a, b) => (/soul/i.test(a.slug + a.name) ? 0 : 1) - (/soul/i.test(b.slug + b.name) ? 0 : 1),
  );

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Crear una cara nueva
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
      <SelectField value="" onChange={(event) => setDescription(event.target.value)}>
        <option value="">Parte de una sugerencia…</option>
        {PEOPLE.map((person) => (
          <option key={person.id} value={person.description}>
            {person.label}
          </option>
        ))}
      </SelectField>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        placeholder="a woman in her mid 40s, dark hair, tired eyes…"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />

      {/*
        Sin modelos, se dice por qué.

        Un desplegable con una sola opción vacía no es un aviso: parece que la
        pantalla sigue cargando, y se espera a algo que no va a llegar.
      */}
      {models.length === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No hay modelos de Higgsfield que ofrecer
          {error ? `: ${error}` : ". Comprueba la sesión del CLI en Estudio."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SelectField value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="">Modelo…</option>
          {sorted.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </SelectField>

        <input
          type="number"
          min={1}
          max={6}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="w-16 rounded-xl border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!description.trim() || !model}
          onClick={() => {
            void generateAvatarsAction({ description, model, count })
              .then((result) => {
                setNote(result.started ? "Lanzado. Las caras aparecerán aquí." : result.message);

                if (result.started) {
                  // Se sondea desde el lienzo: las caras aparecen en el
                  // desplegable según se van generando, sin recargar.
                  onLaunched();
                  setOpen(false);
                }
              })
              .catch((error: unknown) =>
                setNote(error instanceof Error ? error.message : "No se pudo lanzar."),
              );
          }}
        >
          Generar
        </Button>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}

/**
 * De dónde sale la imagen de un nodo de archivo: subida, del producto, o pegada.
 *
 * Las tres a la vez y no un desplegable de «origen»: son tres gestos distintos
 * y quien abre el panel ya sabe cuál quiere. Un paso previo para elegir entre
 * tres cosas que caben en la misma pantalla es un paso de más.
 */
function ImageSource({
  url,
  productImages,
  onPick,
  onAddImages,
}: {
  url: string;
  productImages: { url: string; name: string; primary: boolean }[];
  onPick: (url: string, name: string) => void;
  onAddImages: (images: { url: string; name: string }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  /** Las marcadas para entrar de golpe, cada una en su propio nodo. */
  const [marked, setMarked] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-2">
      {url ? (
        <div>
          {/* Sin recortar: se mira para saber si es la que se quería. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full rounded-lg border border-slate-200 dark:border-slate-800" />
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          setBusy(true);

          const payload = new FormData();
          payload.set("file", file);

          void uploadFlowImageAction(payload)
            .then((result) => {
              setNote(result.message);
              if (result.ok && result.url) onPick(result.url, file.name);
              if (fileRef.current) fileRef.current.value = "";
            })
            .finally(() => setBusy(false));
        }}
        className="w-full text-xs file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs dark:file:bg-slate-800"
      />

      {productImages.length > 0 ? (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            O las fotos del producto. Un clic la pone en este nodo; el doble clic la marca para
            entrar como nodo aparte.
          </p>

          <div className="mt-1 grid grid-cols-4 gap-1">
            {productImages.map((image) => {
              const chosen = url === image.url;
              const queued = marked.has(image.url);

              return (
                <button
                  key={image.url}
                  type="button"
                  title={`${image.name}${image.primary ? " · principal" : ""}`}
                  onClick={() => onPick(image.url, image.name)}
                  onDoubleClick={() =>
                    setMarked((current) => {
                      const next = new Set(current);
                      if (next.has(image.url)) next.delete(image.url);
                      else next.add(image.url);
                      return next;
                    })
                  }
                  className={`relative overflow-hidden rounded-lg border ${
                    chosen
                      ? "border-violet-500 ring-2 ring-violet-300"
                      : queued
                        ? "border-sky-500 ring-2 ring-sky-300"
                        : image.primary
                          ? "border-emerald-400"
                          : "border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.name} className="aspect-square w-full object-cover" />

                  {queued ? (
                    <span className="absolute right-0.5 top-0.5 rounded bg-sky-600 px-1 text-[8px] text-white">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/*
            Varias fotos de golpe.

            Un anuncio de una pieza admite hasta nueve referencias, y ponerlas
            una a una son nueve nodos creados y nueve paneles abiertos. Marcando
            y soltando, entran todas y ya conectadas queda a un arrastre.
          */}
          {marked.size > 0 ? (
            <Button
              onClick={() => {
                onAddImages(
                  productImages
                    .filter((image) => marked.has(image.url))
                    .map((image) => ({ url: image.url, name: image.name })),
                );
                setMarked(new Set());
              }}
            >
              Añadir {marked.size} como nodos
            </Button>
          ) : null}
        </div>
      ) : null}

      <input
        value={url}
        onChange={(event) => onPick(event.target.value, "")}
        placeholder="O pega una dirección"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
      />

      {busy ? <p className="text-xs text-slate-500">Subiendo…</p> : null}
      {note && !busy ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}

/**
 * Escribir el prompt con Claude.
 *
 * Va debajo del campo y no lo sustituye: lo que se escribió a mano sigue ahí
 * hasta que se acepta el reescrito. Un botón que pisa el texto de alguien sin
 * enseñarle antes lo que va a poner es un botón que se pulsa una vez.
 */
function WriteWithClaude({
  draft,
  onWritten,
}: {
  draft: string;
  onWritten: (prompt: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        disabled={busy || !draft.trim()}
        onClick={() => {
          setBusy(true);
          setNote("");

          void polishPromptAction({ draft })
            .then((result) => {
              setNote(result.message);
              if (result.ok && result.prompt) onWritten(result.prompt);
            })
            .catch((error: unknown) =>
              setNote(error instanceof Error ? error.message : "No se pudo escribir."),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Escribiendo…" : "Escribirlo con Claude"}
      </Button>

      {!draft.trim() ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Escribe la idea aunque sea floja —«que se vea bien el frasco»— y la reescribe como plano.
        </p>
      ) : null}

      {note ? <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}

/**
 * Cuántos segundos, dentro de lo que ese generador vende.
 *
 * ## Por qué no es un campo libre
 *
 * Porque pasarse **no da error**. Se pidieron cincuenta segundos a Seedance, que
 * llega a quince: el proveedor recortó a quince sin decir nada y la dirección
 * siguió pidiendo cincuenta segundos de historia, así que el modelo metió todo
 * el guion en un tercio del tiempo. El anuncio salió acelerado y no falló nada
 * en ningún sitio.
 *
 * Con lista cerrada se elige de una lista —Wan solo vende 5, 10 o 15— y con
 * rango libre el número se ajusta al salir del campo, diciendo a qué se ajustó.
 * Y cuando lo que se pide no cabe, se dice cuál es la salida: encadenar planos.
 */
function ClipSeconds({
  model,
  value,
  chains,
  onChange,
}: {
  model: string;
  value: number;
  /** Si el nodo sabe partir el encargo en tramos encadenados. */
  chains?: boolean;
  onChange: (seconds: number) => void;
}) {
  const generator = findGenerator(model);
  const fits = nearestDuration(generator, value);
  const short = fits < Math.round(value);
  const pieces = Math.ceil(Math.max(1, Math.round(value)) / generator.maxSeconds);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Segundos · {durationLabel(generator)}
      </span>

      {generator.durations.length > 0 && !chains ? (
        <SelectField value={String(fits)} onChange={(event) => onChange(Number(event.target.value))}>
          {generator.durations.map((option) => (
            <option key={option} value={option}>
              {option} s
            </option>
          ))}
        </SelectField>
      ) : (
        <input
          type="number"
          min={generator.minSeconds}
          // Partiendo en tramos, el tope deja de ser el del generador: lo que
          // manda es lo que dura el anuncio.
          max={chains ? 180 : generator.maxSeconds}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          // Se ajusta al salir y no al teclear: corregirlo mientras se escribe
          // impide llegar a un número de dos cifras.
          onBlur={() => (chains ? undefined : onChange(fits))}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      )}

      {/*
        Con encadenado, pasarse del tope ya no es un problema: es lo normal.
        Sin él, sigue siendo un recorte y hay que decirlo.
      */}
      {chains && pieces > 1 ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {generator.label} hace {generator.maxSeconds} s por pieza, así que esto sale en{" "}
          {pieces} tramos encadenados: cada uno arranca del último fotograma del anterior y cuenta
          su parte del guion. Son {pieces} generaciones.
        </span>
      ) : short && !chains ? (
        <span className="text-xs text-amber-700 dark:text-amber-400">
          {generator.label} no llega a {Math.round(value)} s: va a durar {fits}. Para más largo,
          monta el anuncio plano a plano y encadénalo con un montaje.
        </span>
      ) : null}
    </label>
  );
}

/**
 * Traer un copy que ya funcionó o un ángulo investigado.
 *
 * ## Por qué se copia el texto al nodo en vez de guardar el identificador
 *
 * Porque un flujo es un plano que se ejecuta meses después. Guardando solo el
 * identificador, borrar ese copy de la biblioteca deja el flujo apuntando a algo
 * que ya no existe — y eso no falla al guardar, falla al ejecutar, a mitad de la
 * cadena y con lo anterior pagado.
 *
 * Con el texto dentro, el flujo sigue diciendo lo mismo pase lo que pase con la
 * biblioteca. Se pierde que se actualice solo, que aquí no se quiere: un guion
 * aprobado no debería cambiar porque alguien editó el copy del que salió.
 */
function PickReference({
  items,
  text,
  label,
  onPick,
}: {
  items: { id: string; kind: "copy" | "angulo"; label: string; text: string }[];
  text: string;
  label: string;
  onPick: (label: string, text: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-300">
        Este producto no tiene copys guardados ni ángulos investigados todavía. Se guardan en su
        ficha; aquí aparecerán solos.
      </p>
    );
  }

  const copies = items.filter((item) => item.kind === "copy");
  const angles = items.filter((item) => item.kind === "angulo");

  return (
    <div className="space-y-2">
      <SelectField
        value=""
        onChange={(event) => {
          const picked = items.find((item) => item.id === event.target.value);
          if (picked) onPick(picked.label, picked.text);
        }}
      >
        <option value="">Elige uno…</option>

        {copies.length > 0 ? (
          <optgroup label="Copys guardados">
            {copies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ) : null}

        {angles.length > 0 ? (
          <optgroup label="Ángulos investigados">
            {angles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </SelectField>

      {/*
        El texto queda editable: casi siempre se trae uno y se le quita el
        nombre de la otra marca o el precio que no es el tuyo.
      */}
      <textarea
        value={text}
        onChange={(event) => onPick(label, event.target.value)}
        rows={6}
        placeholder="O pega aquí el copy directamente"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />

      {label ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">De: {label}</p>
      ) : null}
    </div>
  );
}
