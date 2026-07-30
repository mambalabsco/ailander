"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui";
import { listVoicesAction } from "@/app/products/[id]/video-actions";

interface Voice {
  id: string;
  name: string;
  labels: string[];
  previewUrl?: string;
}

/**
 * Elegir voz de la cuenta, no pegar su identificador.
 *
 * Se cargan del proveedor al abrir. Un identificador copiado a mano es un campo
 * más donde equivocarse, y el error no se ve hasta oír el resultado, con la
 * generación ya pagada.
 *
 * La muestra de audio va al lado porque el nombre no dice cómo suena, y en un
 * anuncio la voz es la mitad del resultado.
 */
export function VoicePicker({
  value,
  onChange,
  enabled,
}: {
  value: string;
  onChange: (id: string) => void;
  enabled: boolean;
}) {
  /*
   * Un solo estado y no tres.
   *
   * Con `voices`, `loading` y `error` por separado hacía falta llamar a
   * `setLoading(true)` dentro del efecto, lo que dispara un render en cascada.
   * Con un único valor el efecto solo escribe **una vez**, al llegar la
   * respuesta, y el estado de partida ya es «cargando».
   */
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; voices: Voice[] } | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!enabled) return;

    let alive = true;

    listVoicesAction().then((result) => {
      if (!alive) return;

      if (result.ok) {
        const voices = result.voices ?? [];
        setState({ kind: "ready", voices });
        // La primera se elige sola: obligar a abrir el desplegable para elegir
        // la única opción razonable es fricción sin motivo.
        if (!value && voices[0]) onChange(voices[0].id);
      } else {
        setState({ kind: "error", message: result.message ?? "No se pudieron leer las voces." });
      }
    });

    return () => {
      alive = false;
    };
    // Solo al montar: recargar la lista en cada cambio de selección haría una
    // petición por cada clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const voices = state.kind === "ready" ? state.voices : [];
  const loading = state.kind === "loading";
  const error = state.kind === "error" ? state.message : "";

  const chosen = voices.find((voice) => voice.id === value);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Voz
        {chosen?.labels.length ? (
          <span className="ml-1 font-normal">· {chosen.labels.slice(0, 2).join(", ")}</span>
        ) : null}
      </span>

      <div className="flex items-center gap-2">
        <SelectField
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!enabled || loading || voices.length === 0}
          className="min-w-48"
        >
          {!enabled ? (
            <option value="">Falta ELEVENLABS_API_KEY</option>
          ) : loading ? (
            <option value="">Cargando…</option>
          ) : voices.length === 0 ? (
            <option value="">Sin voces</option>
          ) : (
            voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))
          )}
        </SelectField>

        {/* Oírla antes de gastar: el nombre no dice cómo suena. */}
        {chosen?.previewUrl ? (
          <audio controls src={chosen.previewUrl} className="h-8 w-40" preload="none" />
        ) : null}
      </div>

      {error ? <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span> : null}
    </label>
  );
}
