"use client";

import { useState, useTransition } from "react";
import { Button, SelectField } from "@/components/ui";
import {
  ENERGIES,
  MOODS,
  attributionFor,
  filterTracks,
  findLicense,
  type Track,
} from "@/lib/video/music-library";
import { pickMusicAction, searchMusicAction } from "@/app/estudio/actions";

/*
 * Vive aparte y no dentro del estudio porque hay **dos** sitios donde se elige
 * música: el estudio y la pestaña de vídeos de un producto. Estaba solo en el
 * primero, así que quien trabaja desde el producto no la veía — y las dos
 * pantallas hacen exactamente lo mismo.
 */

/**
 * Buscar música libre de derechos, filtrarla y dejar que la IA elija.
 *
 * ## Por qué la licencia va delante de todo
 *
 * Porque «música gratis» y «música que puedes poner en un anuncio» no son lo
 * mismo, y la diferencia no se oye. En los catálogos libres, lo que más abunda
 * buscando música de fondo es `by-nc-nd`: prohíbe el uso comercial y prohíbe
 * montarla dentro de un vídeo. Suena perfecta y se descarga igual.
 *
 * Por eso aquí no hay un filtro de licencia que se pueda apagar: solo se piden
 * las que valen, y lo único que se elige es si se aceptan las que obligan a
 * citar al autor —porque eso sí es una decisión, no un riesgo.
 */
export function FreeMusic({
  seconds,
  onUse,
}: {
  seconds: number;
  onUse: (track: Track) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [attribution, setAttribution] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [message, setMessage] = useState("");
  const [criteria, setCriteria] = useState("");
  const [picked, setPicked] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [within, setWithin] = useState("");
  const [busy, startBusy] = useTransition();

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Buscar música libre de derechos
      </Button>
    );
  }

  const shown = filterTracks(tracks, { mood, energy, text: within });

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Qué buscas</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="cinematic piano, ambient, uplifting…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <Button
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              const result = await searchMusicAction({
                text,
                minSeconds: seconds,
                allowAttribution: attribution,
              });

              setTracks(result.tracks);
              setMessage(
                result.problem ||
                  `${result.tracks.length} pista(s) que duran al menos ${Math.round(seconds)} s y se pueden usar en anuncios.`,
              );
            })
          }
        >
          {busy ? "Buscando…" : "Buscar"}
        </Button>
      </div>

      {/*
        De dónde más se puede sacar música, dicho aquí.

        Porque la pregunta que viene después de ver este buscador es siempre la
        misma: «¿y una de YouTube?». La respuesta corta es que no —casi todo lo
        que suena ahí tiene copyright, y en un anuncio eso son retiradas y
        reclamaciones— pero la respuesta útil es que YouTube **regala** una
        biblioteca propia y que esa sí se puede usar, bajándola y subiéndola
        con «Subir la mía».
      */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        ¿Tienes una pista de otro sitio? Súbela con «Subir la mía». Sirve la{" "}
        <a
          href="https://studio.youtube.com/channel/UC/music"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Biblioteca de audio de YouTube
        </a>{" "}
        —gratis y para uso comercial— o cualquier catálogo de pago que tengas.
        Una canción sacada de un vídeo de YouTube no: casi siempre tiene
        copyright y en un anuncio acaba en retirada.
      </p>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={attribution}
          onChange={(event) => setAttribution(event.target.checked)}
        />
        Aceptar también las que obligan a citar al autor (CC BY): hay muchas más, pero el crédito
        tiene que ir donde suene.
      </label>

      {message ? (
        <p className="text-xs text-slate-600 dark:text-slate-300">{message}</p>
      ) : null}

      {tracks.length > 0 ? (
        <>
          {/*
            Filtrar lo que ya se trajo, sin volver a preguntar al catálogo.

            Una búsqueda devuelve cuarenta pistas y escucharlas todas es el
            trabajo que esto venía a quitar. El ánimo y la energía salen de las
            etiquetas del catálogo, así que hay pistas sin clasificar: por eso
            el filtro vacío no filtra, en vez de esconderlas.
          */}
          <div className="flex flex-wrap gap-2">
            <SelectField value={mood} onChange={(event) => setMood(event.target.value)}>
              <option value="">Cualquier ánimo</option>
              {MOODS.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.label}
                </option>
              ))}
            </SelectField>

            <SelectField value={energy} onChange={(event) => setEnergy(event.target.value)}>
              <option value="">Cualquier energía</option>
              {ENERGIES.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.label}
                </option>
              ))}
            </SelectField>

            <input
              value={within}
              onChange={(event) => setWithin(event.target.value)}
              placeholder="Filtrar por palabra…"
              className="min-w-40 flex-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          {/*
            Que elija la IA, con criterios escritos.

            Se le pasan las pistas que hay y devuelve una de ellas. Preguntarle
            sin la lista da una descripción preciosa de una canción que no
            existe, y entonces hay que buscarla a mano.
          */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                O dile con qué criterio elegir
              </span>
              <input
                value={criteria}
                onChange={(event) => setCriteria(event.target.value)}
                placeholder="que no compita con la voz, íntima al principio y que abra al final"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <Button
              disabled={busy || !criteria.trim()}
              onClick={() =>
                startBusy(async () => {
                  const result = await pickMusicAction({ criteria, tracks, seconds });
                  setPicked(result.trackId);
                  setMessage(result.why);
                })
              }
            >
              Que elija por mí
            </Button>
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {shown.map((track) => (
              <li
                key={track.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                  track.id === picked
                    ? "bg-violet-50 dark:bg-violet-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="min-w-40 flex-1 truncate">{track.name}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {Math.round(track.seconds)} s
                </span>

                {/*
                  La licencia, a la vista y en cada fila.

                  Es el dato que decide si esa pista se puede publicar, y
                  esconderlo en un detalle haría que se eligiera por el nombre.
                */}
                <span className="text-slate-500 dark:text-slate-400">
                  {findLicense(track.license ?? "")?.label ?? track.license}
                </span>

                <audio controls preload="none" src={track.url} className="h-7 w-44" />

                <Button variant="ghost" onClick={() => onUse(track)}>
                  Usar
                </Button>
              </li>
            ))}
          </ul>

          {shown.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ninguna de las {tracks.length} encontradas pasa esos filtros. El ánimo sale de las
              etiquetas del catálogo y muchas vienen sin etiquetar.
            </p>
          ) : null}

          {picked && attributionFor(tracks.find((track) => track.id === picked) ?? tracks[0]) ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Hay que acreditar: {attributionFor(tracks.find((track) => track.id === picked)!)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
