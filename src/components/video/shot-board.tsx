"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { SUBTITLE_PRESETS } from "@/lib/video/captions";
import {
  findMusicGenerator,
  findMusicStyle,
  musicCostLabel,
  MUSIC_GENERATORS,
  generatorsFor,
  reach,
  MUSIC_STYLES,
} from "@/lib/video/music";
import { findMusicLevel, MUSIC_LEVELS } from "@/lib/video/loudness";
import { DEFAULT_PRESET, findVoicePreset, VOICE_PRESETS } from "@/lib/video/voice-settings";
import { GenerateButton } from "@/components/generate-button";
import {
  assembleVideoAction,
  chooseMusicAction,
  deleteMusicAction,
  generateMusicAction,
  setSubtitlePresetAction,
  uploadMusicAction,
  generateClipsAction,
  generateKeyframesAction,
  generateVoiceAction,
  addCatalogTrackAction,
} from "@/app/products/[id]/video-actions";
import { ROLE_META, planDurations, reviewShots } from "@/lib/video/shots";
import { FreeMusic } from "@/components/video/free-music";
import { AD_BRIEFS, type Track } from "@/lib/video/music-library";
import type { Video } from "@/lib/data/videos";

/**
 * El tablero de un vídeo: sus tomas y en qué paso va cada una.
 *
 * ## El QC de keyframes es el corazón de esta pantalla
 *
 * El manual del pipeline lo dice sin rodeos: **mirar las imágenes antes de
 * animar es la mejor relación coste/beneficio de todo el proceso.** Regenerar un
 * keyframe malo cuesta dos céntimos; animarlo cuesta la toma entera más el
 * retrabajo.
 *
 * Por eso las imágenes se enseñan grandes y con su botón de rehacer al lado, y
 * por eso animar es un paso aparte que hay que pulsar a conciencia.
 */

const STEPS = ["Guion", "Voz", "Imágenes", "Clips", "Montaje"] as const;

export function ShotBoard({
  productId,
  video,
  providers,
}: {
  productId: string;
  video: Video;
  providers: { voice: boolean; images: boolean; compose: boolean };
}) {
  const [redo, setRedo] = useState<Set<string>>(new Set());
  const [musicNote, setMusicNote] = useState("");
  const [musicMood, setMusicMood] = useState("");
  const [musicStyle, setMusicStyle] = useState(MUSIC_STYLES[0].id);
  /** Si hay archivo elegido. El `ref` no repinta al cambiar, y el botón depende. */
  const [musicChosen, setMusicChosen] = useState(false);
  const [musicModel, setMusicModel] = useState(MUSIC_GENERATORS[0].id);
  const [musicLevel, setMusicLevel] = useState("normal");
  const [tone, setTone] = useState(DEFAULT_PRESET);
  const [isPending, startTransition] = useTransition();
  const musicRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const tracks = video.music;

  const withCuts = video.shots.filter((shot) => shot.cutStart !== null);
  const withKeyframe = video.shots.filter((shot) => shot.keyframeUrl);
  const withClip = video.shots.filter((shot) => shot.clipUrl);

  /*
   * Si dos tomas comparten el mismo clip, el montaje va a repetir ese plano.
   *
   * Se dice **antes** de montar y aquí arriba, porque desde el vídeo terminado
   * ese fallo parece un montaje roto y no lo es: los archivos ya venían
   * repetidos, y montar otra vez daría exactamente lo mismo.
   */
  const clipsRepetidos = withClip
    .map((shot) => shot.clipUrl)
    .filter((url, index, all) => all.indexOf(url) !== index).length;

  const problems = reviewShots(video.shots);

  const plans = planDurations(
    withCuts.map((shot) => ({
      n: shot.n,
      start: shot.cutStart ?? 0,
      end: shot.cutEnd ?? 0,
      guion: shot.guion,
    })),
  );

  /*
    Lo que tiene que durar la música: lo que dura la voz.

    No se pregunta porque ya se sabe, y preguntarlo sería dejar que alguien
    escriba un número distinto del real — que es exactamente cómo se acaba con
    una pista que no cubre el anuncio.
  */
  const musicSeconds = Math.max(10, Math.ceil(video.voiceSeconds || 30));
  const musicChoices = generatorsFor(musicSeconds);
  const musicPick = musicChoices.some((model) => model.id === musicModel)
    ? musicModel
    : musicChoices[0].id;

  const step =
    video.finalUrl ? 4 : withClip.length > 0 ? 3 : withKeyframe.length > 0 ? 2 : withCuts.length > 0 ? 1 : 0;

  const toggle = (n: string) =>
    setRedo((current) => {
      const next = new Set(current);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* En qué paso va, para no perderse entre cinco botones. */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 font-medium ${
              index < step
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : index === step
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      {/*
        Los avisos del guion, antes de cualquier gasto. Ahora corregirlos es
        gratis; después de animar, no.
      */}
      {problems.length > 0 && step < 2 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Revisa esto antes de gastar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((problem, index) => (
              <li key={index}>
                <span className="font-medium">Toma {problem.n}:</span> {problem.problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Los pasos, en orden y con lo que cuesta cada uno. */}
      <div className="flex flex-wrap gap-3">
        {withCuts.length === 0 ? (
          <GenerateButton
            variant="primary"
            action={() => generateVoiceAction({ videoId: video.id, productId, tone })}
            label="Generar la voz"
            disabled={!providers.voice}
            disabledReason={!providers.voice ? "Falta ELEVENLABS_API_KEY" : undefined}
            hint={`Céntimos. De sus tiempos salen los cortes de cada toma. ${findVoicePreset(tone).note}`}
          />
        ) : null}

        {withCuts.length === 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tono</span>
            <SelectField value={tone} onChange={(event) => setTone(event.target.value)} className="min-w-44">
              {VOICE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {withCuts.length > 0 && withKeyframe.length < video.shots.length ? (
          <GenerateButton
            action={() => generateKeyframesAction({ videoId: video.id, productId })}
            label={withKeyframe.length > 0 ? "Generar las que faltan" : "Generar las imágenes"}
            disabled={!providers.images}
            disabledReason={!providers.images ? "Falta KIE_API_KEY" : undefined}
            hint="Unos 0,02 USD cada una. Míralas antes de animar."
          />
        ) : null}

        {redo.size > 0 ? (
          <GenerateButton
            action={() =>
              generateKeyframesAction({ videoId: video.id, productId, only: [...redo] })
            }
            label={`Rehacer ${redo.size} imagen(es)`}
            hint="Solo las marcadas, con el mismo encargo."
          />
        ) : null}

        {/*
          Rehacer **con el envase delante**.

          Existe porque la detección de «en esta toma sale el frasco» lee el
          texto de la escena, y el modelo lo dibuja por su cuenta cuando el
          estilo huele a anuncio de suplemento: ahí sale un bote inventado con
          su etiqueta, convincente, y no se nota hasta compararlo con el de
          verdad.

          Mismo encargo y mismo encuadre; lo único que cambia es que va la foto
          del producto como referencia y la orden de no rediseñarlo.
        */}
        {redo.size > 0 ? (
          <GenerateButton
            variant="primary"
            action={() =>
              generateKeyframesAction({
                videoId: video.id,
                productId,
                only: [...redo],
                conProducto: true,
              })
            }
            label={`Rehacer ${redo.size} con mi producto`}
            disabled={!providers.images}
            hint="El mismo encargo, pero mandando la foto de tu envase. Para las tomas donde salió un frasco inventado."
          />
        ) : null}

        {withKeyframe.length > 0 ? (
          <GenerateButton
            variant={withClip.length === 0 ? "primary" : "secondary"}
            action={() => generateClipsAction({ videoId: video.id, productId })}
            label={withClip.length > 0 ? "Animar las que faltan" : "Animar"}
            disabled={!providers.images}
            hint={`Aquí se va casi todo: ${plans.reduce((sum, plan) => sum + plan.request, 0)} s a unos 0,07 USD el segundo.`}
          />
        ) : null}

        {withClip.length > 0 ? (
          <GenerateButton
            variant="primary"
            action={() => assembleVideoAction({ videoId: video.id, productId })}
            label={video.finalUrl ? "Volver a montar" : "Montar el vídeo"}
            disabled={!providers.compose}
            disabledReason={!providers.compose ? "Falta FAL_KEY" : undefined}
            hint="Céntimos. Lleva los subtítulos animados con tu texto y la música si la has puesto."
          />
        ) : null}
      </div>

      {/*
        La música se pone antes de montar, junto al botón que la usa.

        Va con su aviso porque el montaje **no tiene control de volumen**: una
        pista a nivel normal tapa la voz y el anuncio deja de entenderse, y eso
        no se arregla después.
      */}
      {/*
        La música se puede elegir en cuanto hay voz, no solo cuando hay clips.

        Antes esperaba a los clips, y para entonces ya has pasado por delante de
        esta sección varias veces sin verla. Lo que hace falta para elegir
        música es saber **cuánto tiene que durar**, y eso lo dice la voz: en
        cuanto están los cortes, se sabe.
      */}
      {withCuts.length > 0 || withClip.length > 0 ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-medium">
            Música de fondo{" "}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {video.musicUrl ? "· puesta" : "· sin música"}
            </span>
          </p>

          {/*
            Los pasos van en el orden en que se hacen, numerados.

            Antes el campo del aire estaba **debajo** del botón que lo usa, así
            que se leía al revés: se pulsaba generar y luego se veía el campo. Y
            «Cambiar», que es para subir un archivo propio, quedaba junto a todo
            lo demás como si fuera el botón de aplicar.
          */}
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              1 · Qué quieres que suene
            </p>

            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Aire (opcional)</span>
                <input
                  value={musicMood}
                  onChange={(event) => setMusicMood(event.target.value)}
                  placeholder="tenso al principio, esperanzador al final"
                  className="w-64 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                {/*
                  Encargos ya escritos, por si no quieres escribir uno.

                  Un «música épica» devuelve algo distinto cada vez. Estos llevan
                  instrumentos, tempo, arco y qué **no** hacer, que es lo que
                  hace que la segunda generación se parezca a la primera.
                */}
                <div className="mt-1 flex max-w-64 flex-wrap gap-1">
                  {AD_BRIEFS.map((brief) => (
                    <button
                      key={brief.id}
                      type="button"
                      onClick={() => setMusicMood(brief.prompt)}
                      title={brief.prompt}
                      className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-violet-600 dark:hover:bg-violet-950/40"
                    >
                      {brief.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Generador</span>
                <SelectField
                  value={musicPick}
                  onChange={(event) => setMusicModel(event.target.value)}
                  className="min-w-44"
                >
                  {/*
                    Solo los que llegan a lo que dura el anuncio.

                    Aquí la duración no hay que preguntarla: la marca la voz. Con
                    la lista entera delante, elegir uno de duración fija para un
                    VSL de noventa segundos es un clic normal, y el resultado
                    —treinta segundos de música y sesenta de bucle— no se ve
                    hasta tener el vídeo montado.
                  */}
                  {musicChoices.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} · hasta {reach(model)} s
                    </option>
                  ))}
                </SelectField>
              </label>

              {/*
                El estilo, que es lo que de verdad cambia cómo suena.

                Antes solo había un campo de «aire» escrito a mano, y el encargo
                al modelo era el mismo para todo: cama plana bajo una locución,
                sin subidas y sin melodía. Para eso está bien; para un anuncio
                tipo película era la receta de una pista sosa.
              */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Estilo</span>
                <SelectField
                  value={musicStyle}
                  onChange={(event) => setMusicStyle(event.target.value)}
                  className="min-w-44"
                >
                  {MUSIC_STYLES.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  ))}
                </SelectField>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Volumen</span>
                <SelectField
                  value={musicLevel}
                  onChange={(event) => setMusicLevel(event.target.value)}
                  className="min-w-40"
                >
                  {MUSIC_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </SelectField>
              </label>
            </div>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {findMusicStyle(musicStyle).note} {findMusicGenerator(musicModel).note}{" "}
              {findMusicLevel(musicLevel).note}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              2 · Generarla — se aplica sola al terminar
            </p>

            <div className="mt-2">
              <GenerateButton
                variant="secondary"
                action={() =>
                  generateMusicAction({
                    videoId: video.id,
                    productId,
                    mood: musicMood,
                    estilo: musicStyle,
                    model: musicPick,
                    level: musicLevel,
                  })
                }
                label={video.musicUrl ? "Generar otra" : "Generar música"}
                disabled={!providers.compose}
                disabledReason={!providers.compose ? "Falta FAL_KEY" : undefined}
                hint={`Instrumental y del largo de la voz (${musicSeconds} s). ${musicCostLabel(
                  findMusicGenerator(musicPick),
                  musicSeconds,
                )}`}
              />
            </div>
          </div>

          {/*
            Buscar en catálogos libres, además de generar.

            Generar cuesta y tarda; para una cama de fondo muchas veces basta
            con una pista que ya existe y que dura lo que tiene que durar. Solo
            se ofrecen licencias que permiten anuncios.
          */}
          <FreeMusic
            seconds={musicSeconds}
            onUse={(track: Track) => {
              void addCatalogTrackAction({
                videoId: video.id,
                productId,
                url: track.url,
                name: track.name,
                license: track.license ?? "",
              }).then(() => router.refresh());
            }}
          />

          {/*
            Todas las que se han generado, para escucharlas y elegir.

            Antes solo quedaba la última: generar otra pisaba la anterior y no
            había forma de volver a ella. Con el generador bueno cobrando el
            minuto empezado, eso convertía cada prueba en dinero tirado.
          */}
          {tracks.length > 0 ? (
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  3 · Escúchalas y elige cuál va — {tracks.length} guardada
                  {tracks.length === 1 ? "" : "s"}
                </p>

                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm(`¿Borrar las ${tracks.length} músicas de este vídeo?`)) return;

                    startTransition(async () => {
                      const result = await deleteMusicAction(video.id, productId, "");
                      setMusicNote(result.message);
                      router.refresh();
                    });
                  }}
                >
                  Borrar todas
                </Button>
              </div>

              <ul className="mt-2 space-y-2">
                {tracks.map((track) => {
                  const chosen = track.url === video.musicUrl;

                  return (
                    <li
                      key={track.id}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border p-2 ${
                        chosen
                          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                          : "border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <audio key={track.url} controls preload="none" src={track.url} className="h-9 max-w-xs" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                          {track.model} · {track.prompt}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {Math.round(track.seconds)} s · {track.lufs} LUFS
                          {chosen ? " · va en el vídeo" : ""}
                        </p>
                      </div>

                      {chosen ? null : (
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await chooseMusicAction(video.id, productId, track.url);
                              setMusicNote(result.message);
                              router.refresh();
                            })
                          }
                        >
                          Usar esta
                        </Button>
                      )}

                      <button
                        type="button"
                        aria-label="Borrar esta música"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteMusicAction(video.id, productId, track.id);
                            setMusicNote(result.message);
                            router.refresh();
                          })
                        }
                        className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Ya vienen al volumen elegido. Elegir una no monta nada: hay que volver a montar
                para que entre.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                O usa una tuya
              </span>
              <input
                ref={musicRef}
                type="file"
                accept="audio/*"
                onChange={(event) => setMusicChosen((event.target.files?.length ?? 0) > 0)}
                className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Que venga ya baja: la tuya se sube tal cual y el montaje mezcla sin control de
                volumen.
              </span>
            </label>

          {/*
            Solo se puede pulsar con un archivo elegido.

            Sin esto pulsarlo en vacío mandaba el mismo formulario que «Quitarla»
            y borraba la música — justo lo que uno hace después de generar una,
            creyendo que sirve para aplicarla.
          */}
          <Button
            disabled={isPending || !musicChosen}
            onClick={() =>
              startTransition(async () => {
                const file = musicRef.current?.files?.[0];
                if (!file) return;

                const payload = new FormData();
                payload.set("videoId", video.id);
                payload.set("productId", productId);
                payload.set("music", file);

                const result = await uploadMusicAction(payload);
                setMusicNote(result.message);

                if (musicRef.current) musicRef.current.value = "";
                setMusicChosen(false);
                router.refresh();
              })
            }
          >
            {video.musicUrl ? "Cambiar por la mía" : "Subir la mía"}
          </Button>

          {video.musicUrl ? (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const payload = new FormData();
                  payload.set("videoId", video.id);
                  payload.set("productId", productId);
                  // La intención va explícita: no es «mandar sin archivo».
                  payload.set("remove", "si");

                  const result = await uploadMusicAction(payload);
                  setMusicNote(result.message);
                  router.refresh();
                })
              }
            >
              Quitarla
            </Button>
          ) : null}
          </div>

          {musicNote ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{musicNote}</p>
          ) : null}
        </div>
      ) : null}

      {/*
        El estilo de subtítulo, junto al botón que lo usa.

        Cada uno se explica: elegir «fusion» sin saber qué hace es como se acaba
        con un subtítulo que no pega con el anuncio.
      */}
      {withClip.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Estilo de subtítulo
            </span>
            <SelectField
              value={video.subtitlePreset}
              disabled={isPending}
              onChange={(event) =>
                startTransition(async () => {
                  await setSubtitlePresetAction(video.id, productId, event.target.value);
                  router.refresh();
                })
              }
              className="min-w-52"
            >
              <option value="">Sin subtítulos</option>
              {SUBTITLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </SelectField>
          </label>

          <p className="max-w-72 text-xs text-slate-500 dark:text-slate-400">
            {SUBTITLE_PRESETS.find((preset) => preset.id === video.subtitlePreset)?.note ??
              "El vídeo sale sin texto en pantalla."}
          </p>
        </div>
      ) : null}

      {clipsRepetidos > 0 ? (
        <p className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {clipsRepetidos} toma(s) tienen el <strong>mismo clip</strong> que otra, así que el
          montaje va a repetir ese plano. No es el montaje: los archivos ya vienen repetidos.
          Vuelve a animar esas tomas.
        </p>
      ) : null}

      {video.finalUrl ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          {/*
            El reproductor se vuelve a montar en cada versión.

            Cambiarle el `src` a un `<video>` **no lo recarga**: el navegador se
            queda con el archivo que ya tenía cargado y sigue enseñando el
            montaje anterior. Con la clave, React tira el elemento y crea otro,
            que sí pide el archivo nuevo.

            Y la clave lleva la fecha además de la dirección, por si el montaje
            devuelve la misma: ahí el navegador serviría su copia en caché y
            volvería a parecer que no pasó nada.
          */}
          <video
            key={`${video.finalUrl}#${video.updatedAt}`}
            src={`${video.finalUrl}${video.finalUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(video.updatedAt)}`}
            controls
            className="mx-auto max-h-[70vh] rounded-xl"
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Montado el {new Date(video.updatedAt).toLocaleString("es-ES")}
          </p>
          <a
            href={video.finalUrl}
            download
            className="mt-2 inline-block text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
          >
            Descargar el vídeo
          </a>
        </div>
      ) : null}

      {/* Las tomas. La imagen grande, porque es lo que hay que revisar. */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {video.shots.map((shot) => {
          const plan = plans.find((item) => item.n === shot.n);
          const marked = redo.has(shot.n);

          return (
            <li
              key={shot.id}
              className={`rounded-2xl border p-3 ${
                marked
                  ? "border-amber-400 dark:border-amber-600"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  {shot.n} · {ROLE_META[shot.role].label}
                  {shot.speaking ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">habla</span>
                  ) : null}
                </p>
                {plan ? (
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {plan.voice.toFixed(1)} s
                  </span>
                ) : null}
              </div>

              {shot.keyframeUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   Viene de un CDN externo y con proporción variable: `next/image`
                   exigiría declarar el dominio y no optimiza lo que no sirve él. */
                <img
                  src={shot.keyframeUrl}
                  alt={shot.scene}
                  className="mt-2 w-full rounded-xl"
                  loading="lazy"
                />
              ) : (
                <div className="mt-2 flex aspect-[9/16] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-700">
                  sin imagen
                </div>
              )}

              <p className="mt-2 text-sm">{shot.guion}</p>
              {shot.sub ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  en pantalla: {shot.sub}
                </p>
              ) : null}

              {plan?.freeze ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  clip de {plan.request} s, congelar {plan.freeze.toFixed(2)} s al final
                </p>
              ) : null}

              {shot.error ? (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{shot.error}</p>
              ) : null}

              {/*
                El clip de cada toma, aquí y reproducible.

                Sin esto no había forma de saber si el montaje repetía un plano
                porque el montador los perdía o porque las seis tomas ya
                apuntaban al mismo archivo. Son dos fallos distintos con la misma
                pinta, y se distinguen mirando: si los clips de aquí son
                distintos, el problema está en el montaje; si ya son iguales,
                está antes.
              */}
              {shot.clipUrl ? (
                <video
                  key={shot.clipUrl}
                  src={shot.clipUrl}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  className="mt-2 w-full rounded-xl bg-slate-100 dark:bg-slate-800"
                />
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {shot.clipUrl ? (
                  <a
                    href={shot.clipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-300"
                  >
                    Ver el clip ↗
                  </a>
                ) : null}

                {/*
                  Rehacer esta toma, aquí y sin marcar nada.

                  Marcar y bajar al botón de arriba servía para rehacer varias de
                  golpe, pero para una sola era dar la vuelta entera. Y el caso
                  normal es uno solo: se mira el plano, no cuadra, se rehace.
                */}
                {shot.keyframeUrl ? (
                  <GenerateButton
                    action={() =>
                      generateKeyframesAction({
                        videoId: video.id,
                        productId,
                        only: [shot.n],
                      })
                    }
                    label="Rehacer imagen"
                    hint="Solo esta toma, con el mismo encargo."
                  />
                ) : null}

                {/*
                  Y atada a la persona del anuncio.

                  El ancla se decide leyendo el texto de la escena, y no puede
                  acertar siempre: una toma que dice «primer plano de las manos»
                  lleva persona sin parecerlo, así que sale con otra cara. Esto
                  la ata a la primera toma en la que salió.
                */}
                {shot.keyframeUrl ? (
                  <GenerateButton
                    action={() =>
                      generateKeyframesAction({
                        videoId: video.id,
                        productId,
                        only: [shot.n],
                        conPersona: true,
                      })
                    }
                    label="Rehacer con la misma persona"
                    hint="Le manda la imagen de la primera toma donde salió, para que sea la misma cara."
                  />
                ) : null}

                {/*
                  Y el clip suelto.

                  Rehacer la imagen no rehace el vídeo: el clip sigue siendo el
                  de la imagen vieja, y el montaje lo usaría tal cual. Son dos
                  pasos y aquí están los dos.
                */}
                {shot.keyframeUrl ? (
                  <GenerateButton
                    action={() =>
                      generateClipsAction({ videoId: video.id, productId, only: [shot.n] })
                    }
                    label={shot.clipUrl ? "Rehacer el clip" : "Animar esta toma"}
                    hint="Solo este plano. Después hay que volver a montar para que entre."
                  />
                ) : null}

                {shot.keyframeUrl ? (
                  <Button variant="ghost" onClick={() => toggle(shot.n)}>
                    {marked ? "No rehacer en tanda" : "Marcar para la tanda"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
