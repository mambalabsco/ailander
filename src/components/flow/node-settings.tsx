"use client";

import { Button, SelectField } from "@/components/ui";
import { findNodeType } from "@/lib/flow/graph";
import { VIDEO_GENERATORS } from "@/lib/video/catalog";
import { MUSIC_GENERATORS } from "@/lib/video/music";
import { MUSIC_LEVELS } from "@/lib/video/loudness";
import { VOICE_PRESETS } from "@/lib/video/voice-settings";
import { SUBTITLE_PRESETS } from "@/lib/video/captions";
import { ASPECTS } from "@/lib/video/aspect";

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
  avatars: { id: string; name: string }[];
  onChange: (settings: Record<string, unknown>) => void;
  onDelete: () => void;
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
  onChange,
  onDelete,
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

        <Button variant="ghost" onClick={onDelete}>
          Quitar
        </Button>
      </div>

      {type === "prompt"
        ? field(
            "Qué se le pide",
            <textarea
              value={text(settings, "text")}
              onChange={(event) => set("text", event.target.value)}
              rows={4}
              placeholder="Close-up del envase sobre mármol, luz de mañana…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />,
          )
        : null}

      {type === "archivo" ? field("Dirección de la imagen", input("url", "https://…")) : null}

      {type === "avatar"
        ? field(
            "Qué cara",
            <SelectField
              value={text(settings, "avatarId")}
              onChange={(event) => set("avatarId", event.target.value)}
            >
              {/*
                Vacío no es un descuido: es «la que diga la vuelta». Es lo que
                permite ejecutar el mismo flujo con seis caras distintas.
              */}
              <option value="">La de cada vuelta</option>
              {avatars.map((avatar) => (
                <option key={avatar.id} value={avatar.id}>
                  {avatar.name}
                </option>
              ))}
            </SelectField>,
          )
        : null}

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

      {type === "imagen" ? aspect() : null}

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
            </SelectField>,
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {VIDEO_GENERATORS.find(
              (model) => model.id === (text(settings, "model") || (type === "anuncio" ? "seedance2" : "")),
            )?.note ?? ""}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {seconds("seconds", type === "anuncio" ? 15 : 6)}
            {aspect()}
          </div>

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
