"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { SUBTITLE_PRESETS } from "@/lib/video/captions";
import { ASPECTS, aspectsFor, nearestAspect, pixels } from "@/lib/video/aspect";
import { findMusicGenerator, musicCostLabel, MUSIC_GENERATORS } from "@/lib/video/music";
import { MUSIC_LEVELS } from "@/lib/video/loudness";
import { DEFAULT_PRESET, findVoicePreset, VOICE_PRESETS } from "@/lib/video/voice-settings";
import {
  durationLabel,
  estimateCost,
  findGenerator,
  nearestDuration,
  VIDEO_GENERATORS,
} from "@/lib/video/catalog";
import {
  assembleProjectAction,
  cliCostAction,
  cliDurationsAction,
  cloneVoiceAction,
  createProjectAction,
  deleteAssetAction,
  deleteProjectAction,
  makeClipAction,
  makeImageAction,
  makeMusicAction,
  makeVoiceAction,
  moveAssetAction,
  polishPromptAction,
  studioVoicesAction,
  toggleAssetAction,
  uploadToStudioAction,
} from "@/app/estudio/actions";

/**
 * La mesa del estudio.
 *
 * ## Lo que la hace usable: el orden se ve
 *
 * Las piezas van en una tira, numeradas, y se mueven con flechas. Un montaje es
 * una decisión de orden, así que ese orden tiene que estar delante — no
 * escondido en un desplegable ni implícito en la fecha de creación.
 *
 * ## Y descartar no es borrar
 *
 * Una pieza se puede sacar del montaje sin perderla. Una toma que hoy no encaja
 * mañana sirve, y volver a generarla cuesta dinero; el interruptor es gratis.
 */

export interface StudioProjectView {
  id: string;
  name: string;
  productId: string;
}

export interface StudioAssetView {
  id: string;
  kind: "imagen" | "clip" | "voz" | "musica" | "video";
  url: string;
  name: string;
  model: string;
  seconds: number;
  included: boolean;
}

const KIND_LABEL: Record<StudioAssetView["kind"], string> = {
  imagen: "Imagen",
  clip: "Clip",
  voz: "Voz",
  musica: "Música",
  video: "Montaje",
};

export function StudioBoard({
  projects,
  current,
  assets,
  products,
  cliModels,
  cliVideoModels,
  higgsfield,
}: {
  projects: StudioProjectView[];
  current: StudioProjectView | null;
  assets: StudioAssetView[];
  products: { id: string; name: string }[];
  cliModels: { slug: string; name: string }[];
  cliVideoModels: { slug: string; name: string; takesReferences: boolean }[];
  /** Si el CLI de Higgsfield responde, por qué no, y dónde busca la sesión. */
  higgsfield: { ok: boolean; reason: string; credentialsPath?: string; hasCredentials?: boolean };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const [newName, setNewName] = useState("");
  const [newProduct, setNewProduct] = useState(products[0]?.id ?? "");

  const [prompt, setPrompt] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imageAspect, setImageAspect] = useState("9:16");
  const [refs, setRefs] = useState<Set<string>>(new Set());

  const [clipPrompt, setClipPrompt] = useState("");
  const [clipModel, setClipModel] = useState(VIDEO_GENERATORS[0].id);
  const [clipSeconds, setClipSeconds] = useState(6);
  /** Las duraciones que declara el modelo de Higgsfield elegido. */
  const [cliDurations, setCliDurations] = useState<number[]>([]);
  /** Lo que dice `generate cost`, ya redactado por el servidor. */
  const [cliCostNote, setCliCostNote] = useState("");
  const [clipRefs, setClipRefs] = useState<Set<string>>(new Set());
  const [clipSound, setClipSound] = useState(false);
  const [wantedClipAspect, setClipAspect] = useState("9:16");
  const [polishing, setPolishing] = useState(false);

  const [voiceText, setVoiceText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);

  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicSeconds, setMusicSeconds] = useState(30);
  const [musicModel, setMusicModel] = useState(MUSIC_GENERATORS[0].id);
  const [musicLevel, setMusicLevel] = useState("normal");
  const [tone, setTone] = useState(DEFAULT_PRESET);

  const [preset, setPreset] = useState("hustle");

  const uploadRef = useRef<HTMLInputElement>(null);
  const cloneRef = useRef<HTMLFormElement>(null);

  const images = assets.filter((asset) => asset.kind === "imagen");
  const inMontage = assets.filter((asset) => asset.included);

  const go = (id: string) => router.push(`/estudio?p=${id}`);

  /*
   * Lo que admite el modelo elegido manda sobre lo que se ve.
   *
   * Uno de solo texto no tiene dónde meter una imagen: ofrecerle el selector de
   * referencias es prometer algo que la API va a ignorar en silencio, que es
   * exactamente el fallo que se está evitando en toda esta parte.
   *
   * Los de Higgsfield van por su CLI y llevan `hf:` delante. De ellos se sabe
   * bastante menos —ni duración ni precio, porque cada uno tiene el suyo y lo
   * dice él— así que se pregunta lo justo y el resto no se pinta.
   */
  const cliClip = clipModel.startsWith("hf:")
    ? (cliVideoModels.find((model) => `hf:${model.slug}` === clipModel) ?? null)
    : null;

  const clipGenerator = findGenerator(clipModel);

  /*
    Las duraciones se piden al cambiar de modelo, no al abrir la pantalla.

    Preguntar por los cuarenta del catálogo serían cuarenta idas y vueltas al
    CLI para pintar un desplegable, y treinta y nueve no se van a usar.
  */
  const cliSlug = cliClip?.slug ?? "";

  useEffect(() => {
    let live = true;

    /*
      Todo dentro del asíncrono, incluido el caso de «no hay modelo».

      Llamar a `setCliDurations` en el cuerpo del efecto es un cambio de estado
      síncrono durante el renderizado, que React marca como error. Y de paso el
      coste anterior se borra aquí: era de otro modelo, y una cifra vieja al
      lado de un modelo nuevo es peor que ninguna.
    */
    void (async () => {
      const list = cliSlug ? await cliDurationsAction(cliSlug) : [];
      if (!live) return;

      setCliDurations(list);
      setCliCostNote("");
    })();

    return () => {
      live = false;
    };
  }, [cliSlug]);

  const clipTakesRefs = cliClip ? cliClip.takesReferences : clipGenerator.refField !== null;
  const clipManyRefs = cliClip ? true : clipGenerator.refIsArray;
  /*
    Los de Higgsfield también tienen duración.

    Antes se daba por hecho que no —«este modelo decide él la duración»— y era
    verdad solo porque nunca se le mandaba: el campo no salía, no se enviaba
    nada y todos generaban su duración por defecto. Ahora se le pregunta al
    modelo qué acepta y se enseña lo que diga.
  */
  const clipHasDuration = true;
  const clipNativeAudio = !cliClip && clipGenerator.audioField !== null;
  const clipCost = cliClip ? null : estimateCost(clipGenerator, clipSeconds);

  const clipNote = cliClip
    ? "De Higgsfield, por su CLI. Los segundos y el coste los dice el propio modelo."
    : clipGenerator.note;

  /*
   * La forma solo se puede pedir donde el modelo la acepta.
   *
   * Los de imagen a vídeo la heredan del keyframe: mandarles además una
   * proporción distinta recorta o estira sin decir nada. Y al cambiar de modelo
   * se cae en la admitida más parecida, para no acabar en la de por defecto sin
   * enterarse.
   */
  const clipHasAspect = cliClip ? true : clipGenerator.hasAspectRatio;
  const clipAspects = aspectsFor([]);
  const clipAspect = nearestAspect(
    wantedClipAspect,
    clipAspects.map((aspect) => aspect.id),
  );

  const clipReferences = [...clipRefs];

  // Higgsfield siempre quiere prompt; las imágenes son opcionales en los suyos.
  const clipReady = cliClip
    ? clipPrompt.trim().length > 0
    : clipTakesRefs
      ? clipReferences.length > 0
      : clipPrompt.trim().length > 0;

  const toggleClipRef = (url: string) =>
    setClipRefs((current) => {
      const next = new Set(current);

      if (next.has(url)) next.delete(url);
      // Los que quieren una sola imagen se quedan con la última marcada, para que
      // no haya duda de cuál va a usar.
      else if (clipManyRefs) next.add(url);
      else return new Set([url]);

      return next;
    });

  /** Le pide al modelo que reescriba el prompt como un encargo de cámara. */
  const polish = () => {
    setPolishing(true);

    void polishPromptAction({
      draft: clipPrompt,
      model: clipModel,
      seconds: clipSeconds,
      context: current?.name ?? "",
    })
      .then((result) => {
        if (result.ok) setClipPrompt(result.prompt);
        setNote(result.message);
      })
      .finally(() => setPolishing(false));
  };

  return (
    <div className="space-y-6">
      {note ? (
        <p className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          {note}
        </p>
      ) : null}

      {/*
        Sin CLI no hay catálogo de Higgsfield, y hay que decirlo aquí arriba.

        Sin este aviso los desplegables salen con un solo modelo y eso se lee
        como «no hay más», cuando lo que pasa casi siempre es que la sesión del
        CLI caducó en el servidor. Son dos cosas muy distintas y solo una se
        arregla en un minuto.
      */}
      {higgsfield.ok && !higgsfield.reason ? null : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">
            {higgsfield.ok
              ? "El CLI de Higgsfield respondió, pero su catálogo no se pudo leer"
              : "Los modelos de Higgsfield no están disponibles"}
          </p>
          <p className="mt-1">
            {higgsfield.reason ||
              "El CLI de Higgsfield no responde. Sin él solo están los modelos de kie."}
          </p>
          {higgsfield.ok ? (
            <p className="mt-1 text-xs">
              Comprueba qué devuelve:{" "}
              <code>cd /home/plataforma/plataforma-ia && npx higgsfield model list --video --json</code>
            </p>
          ) : (
            /*
              El login abre un navegador y devuelve a `localhost:8765`.

              Por SSH eso no llega: el navegador está en tu máquina y quien
              escucha en ese puerto es el servidor. El túnel es lo que los une, y
              sin él el login «sale bien» y la sesión nunca se guarda.

              Y tiene que ser **el usuario del servicio**: el CLI guarda en el
              HOME de quien ejecuta, así que con `sudo` acaba en /root.
            */
            <div className="mt-2 space-y-1 text-xs">
              <p>
                <strong>1.</strong> En tu Mac, abre el túnel. Deja esta ventana abierta: el túnel
                vive mientras dure la sesión.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-amber-100/60 p-2 dark:bg-amber-950/60">
                <code>ssh -L 8765:localhost:8765 root@TU-SERVIDOR</code>
              </pre>

              <p>
                <strong>2.</strong> Ya dentro, cambia al usuario del servicio. El guion no es
                opcional: sin él conservas el HOME del usuario anterior y la sesión acaba en una
                carpeta que la plataforma no mira.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-amber-100/60 p-2 dark:bg-amber-950/60">
                <code>su - plataforma</code>
              </pre>

              <p>
                <strong>3.</strong> Ahora el login:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-amber-100/60 p-2 dark:bg-amber-950/60">
                <code>cd /home/plataforma/plataforma-ia && npx higgsfield auth login --port 8765</code>
              </pre>

              <p>
                <strong>4.</strong> Copia la dirección que imprima y ábrela en el navegador del
                Mac. La vuelta a <code>localhost:8765</code> viaja por el túnel hasta el CLI que
                está esperando en el servidor. Comprueba con{" "}
                <code>npx higgsfield auth token</code> antes de salir.
              </p>

              <p>
                El túnel usa la dirección con la que ya entras por SSH —si el dominio va por
                Cloudflare, ahí no pasa SSH y hay que usar la IP—.
                {higgsfield.credentialsPath ? (
                  <> Aquí se busca en <code>{higgsfield.credentialsPath}</code>.</>
                ) : null}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------ Proyectos ------------------------- */}

      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-end gap-3">
          {projects.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Proyecto
              </span>
              <SelectField
                value={current?.id ?? ""}
                onChange={(event) => go(event.target.value)}
                className="min-w-56"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectField>
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Nuevo proyecto
            </span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Anuncio tiroides · agosto"
              className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {products.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                De qué producto
              </span>
              <SelectField
                value={newProduct}
                onChange={(event) => setNewProduct(event.target.value)}
                className="min-w-44"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </SelectField>
            </label>
          ) : null}

          <Button
            variant="primary"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await createProjectAction(newName, newProduct);
                setNote(result.message);
                setNewName("");
                router.refresh();
              })
            }
          >
            Crear
          </Button>

          {current ? (
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  if (!window.confirm(`¿Borrar «${current.name}» y todas sus piezas?`)) return;
                  await deleteProjectAction(current.id);
                  router.refresh();
                })
              }
            >
              Borrar proyecto
            </Button>
          ) : null}
        </div>
      </section>

      {!current ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Crea un proyecto para empezar. Cada anuncio en el suyo: mezclarlos obliga a buscar entre
          cien miniaturas cuál era de cuál.
        </p>
      ) : (
        <>
          {/* ---------------------------- Generadores ---------------------- */}

          <section className="grid gap-4 lg:grid-cols-2">
            {/* Imagen */}
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Imagen</p>

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Mujer de 50 en su cocina al amanecer, luz lateral suave…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <SelectField
                  value={imageModel}
                  onChange={(event) => setImageModel(event.target.value)}
                  className="min-w-48"
                >
                  <option value="">Nano Banana (rápido y barato)</option>

                  {cliModels.length > 0 ? (
                    <optgroup label={`Higgsfield · ${cliModels.length} modelos`}>
                      {cliModels.map((model) => (
                        <option key={model.slug} value={`hf:${model.slug}`}>
                          {model.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </SelectField>

                {/*
                  La forma, que antes estaba escrita a fuego en «9:16».
                  Un anuncio es vertical, pero una miniatura es apaisada y una
                  publicación de feed es cuadrada, y no había forma de pedirlas.
                */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Forma</span>
                  <SelectField
                    value={imageAspect}
                    onChange={(event) => setImageAspect(event.target.value)}
                    className="min-w-44"
                  >
                    {ASPECTS.map((aspect) => (
                      <option key={aspect.id} value={aspect.id}>
                        {aspect.label} · {aspect.id} — {aspect.note}
                      </option>
                    ))}
                  </SelectField>
                </label>
              </div>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sale a {pixels(imageAspect)}.
              </p>

              {/*
                Las referencias se eligen de las imágenes del proyecto.
                
                Es lo que mantiene un personaje o un envase igual entre tomas, y
                por eso se marcan aquí en vez de pegar direcciones a mano.
              */}
              {images.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Referencias {refs.size > 0 ? `· ${refs.size}` : "(opcional)"}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {images.map((image) => {
                      const on = refs.has(image.url);

                      return (
                        <li key={image.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setRefs((current) => {
                                const next = new Set(current);
                                if (next.has(image.url)) next.delete(image.url);
                                else next.add(image.url);
                                return next;
                              })
                            }
                            className={`block overflow-hidden rounded-lg border-2 ${
                              on ? "border-violet-600" : "border-transparent"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image.url} alt={image.name} className="size-14 object-cover" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeImageAction({
                      projectId: current.id,
                      prompt,
                      model: imageModel,
                      aspectRatio: imageAspect,
                      references: [...refs],
                    })
                  }
                  label="Generar imagen"
                  disabled={!prompt.trim()}
                  hint="Unos 2 céntimos. Las referencias mantienen el personaje o el envase igual entre tomas."
                />
              </div>
            </div>

            {/* Clip */}
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Vídeo</p>

              <SelectField
                value={clipModel}
                onChange={(event) => setClipModel(event.target.value)}
                className="mt-2 w-full"
              >
                <optgroup label="kie">
                  {VIDEO_GENERATORS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.usdPerSecond > 0 ? ` · $${model.usdPerSecond.toFixed(3)}/s` : ""}
                    </option>
                  ))}
                </optgroup>

                {cliVideoModels.length > 0 ? (
                  <optgroup label={`Higgsfield · ${cliVideoModels.length} modelos`}>
                    {cliVideoModels.map((model) => (
                      <option key={model.slug} value={`hf:${model.slug}`}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectField>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{clipNote}</p>

              {/*
                Si no hay ninguno de Higgsfield se dice por qué, en vez de dejar
                un desplegable a medias: casi siempre es la sesión caducada del
                CLI, y desde la pantalla eso es indistinguible de «no existen».
              */}
              {cliVideoModels.length === 0 && higgsfield.ok ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Higgsfield respondió pero no devolvió ningún modelo de vídeo.
                </p>
              ) : null}

              <textarea
                value={clipPrompt}
                onChange={(event) => setClipPrompt(event.target.value)}
                rows={3}
                placeholder={
                  clipTakesRefs
                    ? "Se lleva la mano al cuello, la cámara se acerca despacio"
                    : "Descríbelo todo: no hay imagen de partida y esto es lo único que va a ver"
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={polish}
                  disabled={polishing || !clipPrompt.trim()}
                >
                  {polishing ? "Reescribiendo…" : "Mejorar el prompt"}
                </Button>

                {/*
                  El coste se pide, no se calcula aquí.

                  Higgsfield cobra en créditos y cada modelo tiene su tarifa; la
                  única cifra que no es una suposición es la que da su propio
                  `generate cost`, que es el mismo cálculo del trabajo real sin
                  crearlo. Va a mano y no en cada tecla porque es una llamada.
                */}
                {cliClip ? (
                  <Button
                    variant="ghost"
                    disabled={!clipPrompt.trim()}
                    onClick={() => {
                      setCliCostNote("Calculando…");

                      void cliCostAction({
                        slug: cliClip.slug,
                        prompt: clipPrompt,
                        seconds: clipSeconds,
                      }).then((result) => setCliCostNote(result.label));
                    }}
                  >
                    Cuánto cuesta
                  </Button>
                ) : null}

                {cliCostNote ? (
                  <span className="text-xs text-slate-600 dark:text-slate-300">{cliCostNote}</span>
                ) : null}
              </div>

              {/*
                Las referencias solo aparecen donde el modelo sabe leerlas.
                Enseñarlas siempre haría creer que la foto se está usando cuando
                el modelo elegido ni la mira.
              */}
              {clipTakesRefs ? (
                <div className="mt-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {cliClip
                      ? "Imágenes de partida — opcionales; se le preguntará al modelo cómo las quiere"
                      : clipManyRefs
                        ? "Imágenes de partida — marca las que quieras"
                        : "Imagen de partida — este modelo admite una sola"}
                  </p>

                  {images.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Todavía no hay imágenes en el proyecto. Genera una arriba o sube la tuya.
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {images.map((image) => {
                        const on = clipRefs.has(image.url);

                        return (
                          <li key={image.id}>
                            <button
                              type="button"
                              onClick={() => toggleClipRef(image.url)}
                              className={`rounded-xl border px-2 py-1 text-xs ${
                                on
                                  ? "border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
                                  : "border-slate-300 dark:border-slate-700"
                              }`}
                            >
                              {image.name || "Imagen"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-end gap-3">
                {/*
                  Con lista cerrada se elige de una lista, no se teclea.
                  Wan solo vende 5, 10 o 15 segundos y Hailuo 6 o 10: un campo
                  libre deja escribir un 7 que el modelo rechaza, y el error
                  llega después de haber lanzado el trabajo.
                */}
                {!clipHasDuration ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Este modelo decide él la duración.
                  </p>
                ) : cliClip ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Segundos
                      {cliDurations.length > 0 ? ` · ${cliDurations.join(", ")}` : ""}
                    </span>

                    {cliDurations.length > 0 ? (
                      <SelectField
                        value={String(nearestOf(cliDurations, clipSeconds))}
                        onChange={(event) => setClipSeconds(Number(event.target.value))}
                        className="w-24"
                      >
                        {cliDurations.map((option) => (
                          <option key={option} value={option}>
                            {option} s
                          </option>
                        ))}
                      </SelectField>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={clipSeconds}
                        onChange={(event) => setClipSeconds(Number(event.target.value))}
                        className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    )}
                  </label>
                ) : clipGenerator.durations.length > 0 ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Segundos</span>
                    <SelectField
                      value={String(nearestDuration(clipGenerator, clipSeconds))}
                      onChange={(event) => setClipSeconds(Number(event.target.value))}
                      className="w-24"
                    >
                      {clipGenerator.durations.map((option) => (
                        <option key={option} value={option}>
                          {option} s
                        </option>
                      ))}
                    </SelectField>
                  </label>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Segundos · {durationLabel(clipGenerator)}
                    </span>
                    <input
                      type="number"
                      min={clipGenerator.minSeconds}
                      max={clipGenerator.maxSeconds}
                      value={clipSeconds}
                      onChange={(event) => setClipSeconds(Number(event.target.value))}
                      className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                )}

                {/*
                  Los de vídeo solo entienden las tres universales: lo dice la
                  documentación de Kling y de Grok. Ofrecer 4:5 aquí sería
                  prometer una forma que devuelven en otra sin avisar.
                */}
                {clipHasAspect ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Forma</span>
                    <SelectField
                      value={clipAspect}
                      onChange={(event) => setClipAspect(event.target.value)}
                      className="min-w-40"
                    >
                      {clipAspects.map((aspect) => (
                        <option key={aspect.id} value={aspect.id}>
                          {aspect.label} · {aspect.id}
                        </option>
                      ))}
                    </SelectField>
                  </label>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    La forma la hereda de la imagen de partida.
                  </p>
                )}

                {clipNativeAudio ? (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={clipSound}
                      onChange={(event) => setClipSound(event.target.checked)}
                    />
                    <span>Que genere sonido él mismo</span>
                  </label>
                ) : null}
              </div>

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeClipAction({
                      projectId: current.id,
                      prompt: clipPrompt,
                      model: clipModel,
                      seconds: clipSeconds,
                      references: clipReferences,
                      sound: clipSound,
                      aspectRatio: clipAspect,
                    })
                  }
                  label="Generar vídeo"
                  disabled={!clipReady}
                  disabledReason={
                    clipReady
                      ? undefined
                      : cliClip || !clipTakesRefs
                        ? "Escribe el prompt"
                        : "Marca al menos una imagen"
                  }
                  hint={
                    clipCost === null
                      ? "El precio de este modelo no está confirmado; lo que cobre lo dirá el proveedor."
                      : `Unos ${clipCost.toFixed(2)} USD. Es lo caro del vídeo.`
                  }
                />
              </div>
            </div>

            {/* Voz */}
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Voz</p>

              <textarea
                value={voiceText}
                onChange={(event) => setVoiceText(event.target.value)}
                rows={3}
                placeholder="Lo que se narra. Escribe las siglas deletreadas y los números en palabras."
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <SelectField
                  value={voiceId}
                  onChange={(event) => setVoiceId(event.target.value)}
                  className="min-w-48"
                >
                  <option value="">Elige una voz…</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </SelectField>

                <Button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const list = await studioVoicesAction();
                      setVoices(list.map((voice) => ({ id: voice.id, name: voice.name })));
                      setNote(`${list.length} voces disponibles.`);
                    })
                  }
                >
                  {voices.length > 0 ? "Recargar" : "Cargar voces"}
                </Button>
              </div>

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeVoiceAction({ projectId: current.id, text: voiceText, voiceId, tone })
                  }
                  label="Generar voz"
                  disabled={!voiceText.trim() || !voiceId}
                  disabledReason={!voiceId ? "Carga las voces y elige una" : undefined}
                  hint="Céntimos. Escribe fonético: «eme ce te» en vez de «MCT», o se pronuncia mal."
                />
              </div>

              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tono</span>
                <SelectField value={tone} onChange={(event) => setTone(event.target.value)}>
                  {VOICE_PRESETS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </SelectField>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {findVoicePreset(tone).note}
                </span>
              </label>

              {/* Clonar */}
              <form ref={cloneRef} className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Clonar una voz
                </p>

                <input
                  name="name"
                  placeholder="Nombre de la voz"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="file"
                  name="samples"
                  accept="audio/*"
                  multiple
                  className="mt-2 w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Un minuto limpio vale más que diez con ruido: el clonado copia lo que oye,
                  incluido el eco de la sala.
                </p>

                <Button
                  className="mt-2"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const form = cloneRef.current;
                      if (!form) return;

                      const result = await cloneVoiceAction(new FormData(form));
                      setNote(result.message);

                      if (result.ok) {
                        const list = await studioVoicesAction();
                        setVoices(list.map((voice) => ({ id: voice.id, name: voice.name })));
                      }
                    })
                  }
                >
                  Clonar
                </Button>
              </form>
            </div>

            {/* Música y subidas */}
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-medium">Música</p>

              <input
                value={musicPrompt}
                onChange={(event) => setMusicPrompt(event.target.value)}
                placeholder="Cálida y esperanzadora, pulso constante, sin voces"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Generador</span>
                  <SelectField
                    value={musicModel}
                    onChange={(event) => setMusicModel(event.target.value)}
                    className="min-w-40"
                  >
                    {MUSIC_GENERATORS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Volumen</span>
                  <SelectField
                    value={musicLevel}
                    onChange={(event) => setMusicLevel(event.target.value)}
                    className="min-w-36"
                  >
                    {MUSIC_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </SelectField>
                </label>

                {/*
                  Los que no dejan pedir duración no la preguntan: el campo
                  daría a entender que se respeta, y dan lo que dan.
                */}
                {findMusicGenerator(musicModel).durationField ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Segundos</span>
                    <input
                      type="number"
                      min={findMusicGenerator(musicModel).minSeconds}
                      max={findMusicGenerator(musicModel).maxSeconds}
                      value={musicSeconds}
                      onChange={(event) => setMusicSeconds(Number(event.target.value))}
                      className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Este no deja pedir duración.
                  </p>
                )}
              </div>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {findMusicGenerator(musicModel).note}
              </p>

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeMusicAction({
                      projectId: current.id,
                      prompt: musicPrompt,
                      seconds: musicSeconds,
                      model: musicModel,
                      level: musicLevel,
                    })
                  }
                  label="Generar música"
                  disabled={!musicPrompt.trim()}
                  hint={`${musicCostLabel(findMusicGenerator(musicModel), musicSeconds)} Sale ya al volumen elegido y se puede escuchar en la tira de abajo.`}
                />
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Subir lo tuyo
                </p>

                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/*,audio/*,video/mp4,video/webm"
                  multiple
                  className="mt-2 w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
                />

                <Button
                  className="mt-2"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const files = uploadRef.current?.files;
                      if (!files?.length) {
                        setNote("Elige algún archivo antes de subir.");
                        return;
                      }

                      const payload = new FormData();
                      payload.set("projectId", current.id);
                      for (const file of files) payload.append("files", file);

                      const result = await uploadToStudioAction(payload);
                      setNote(result.message);
                      if (uploadRef.current) uploadRef.current.value = "";
                      router.refresh();
                    })
                  }
                >
                  Subir
                </Button>
              </div>
            </div>
          </section>

          {/* ------------------------------ La tira ------------------------ */}

          <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">El montaje</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  En este orden. Lo que esté apagado no entra, pero no se pierde.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Subtítulos
                  </span>
                  <SelectField
                    value={preset}
                    onChange={(event) => setPreset(event.target.value)}
                    className="min-w-40"
                  >
                    <option value="">Sin subtítulos</option>
                    {SUBTITLE_PRESETS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </SelectField>
                </label>

                <GenerateButton
                  variant="primary"
                  action={() => assembleProjectAction({ projectId: current.id, preset })}
                  label="Montar"
                  disabled={inMontage.filter((asset) => asset.kind === "clip").length === 0}
                  disabledReason="Necesitas al menos un clip encendido"
                  hint="Los planos se recortan y se pegan aparte, y el audio se mezcla encima."
                />
              </div>
            </div>

            {assets.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Todavía no hay piezas. Genera una imagen y anímala, o sube lo tuyo.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {assets.map((asset, index) => (
                  <li
                    key={asset.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border p-2 ${
                      asset.included
                        ? "border-slate-200 dark:border-slate-800"
                        : "border-dashed border-slate-300 opacity-50 dark:border-slate-700"
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center text-sm tabular-nums text-slate-400">
                      {index + 1}
                    </span>

                    {asset.kind === "imagen" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={asset.url} alt={asset.name} className="size-16 rounded-lg object-cover" />
                    ) : asset.kind === "clip" || asset.kind === "video" ? (
                      <video
                        key={asset.url}
                        src={asset.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800"
                      />
                    ) : (
                      <audio key={asset.url} src={asset.url} controls className="h-10 max-w-64" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {KIND_LABEL[asset.kind]}
                        <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                          {asset.name || asset.model}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {asset.model}
                        {asset.seconds > 0 ? ` · ${asset.seconds.toFixed(1)} s` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        disabled={isPending || index === 0}
                        onClick={() =>
                          startTransition(async () => {
                            await moveAssetAction(current.id, asset.id, index - 1);
                            router.refresh();
                          })
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        disabled={isPending || index === assets.length - 1}
                        onClick={() =>
                          startTransition(async () => {
                            await moveAssetAction(current.id, asset.id, index + 1);
                            router.refresh();
                          })
                        }
                      >
                        ↓
                      </Button>

                      <Button
                        variant={asset.included ? "secondary" : "primary"}
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await toggleAssetAction(asset.id, !asset.included);
                            router.refresh();
                          })
                        }
                      >
                        {asset.included ? "Quitar" : "Poner"}
                      </Button>

                      <Button
                        variant="danger"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await deleteAssetAction(asset.id);
                            router.refresh();
                          })
                        }
                      >
                        Borrar
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * El valor más cercano de una lista.
 *
 * Para las duraciones de Higgsfield, que llegan en marcha y no están en la
 * tabla de generadores. Sin esto, un desplegable con 5 y 10 abierto con un 6
 * guardado no enseñaría ninguno seleccionado y el primer valor se aplicaría en
 * silencio al generar.
 */
function nearestOf(options: number[], wanted: number): number {
  return options.reduce((best, option) =>
    Math.abs(option - wanted) < Math.abs(best - wanted) ? option : best,
  );
}
