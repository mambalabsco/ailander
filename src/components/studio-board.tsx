"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { SUBTITLE_PRESETS } from "@/lib/video/captions";
import { VIDEO_MODELS } from "@/lib/video/shots";
import {
  assembleProjectAction,
  cloneVoiceAction,
  createProjectAction,
  deleteAssetAction,
  deleteProjectAction,
  makeClipAction,
  makeImageAction,
  makeMusicAction,
  makeVoiceAction,
  moveAssetAction,
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
  hasHiggsfield,
}: {
  projects: StudioProjectView[];
  current: StudioProjectView | null;
  assets: StudioAssetView[];
  products: { id: string; name: string }[];
  cliModels: { slug: string; name: string }[];
  hasHiggsfield: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const [newName, setNewName] = useState("");
  const [newProduct, setNewProduct] = useState(products[0]?.id ?? "");

  const [prompt, setPrompt] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [refs, setRefs] = useState<Set<string>>(new Set());

  const [clipPrompt, setClipPrompt] = useState("");
  const [clipModel, setClipModel] = useState(VIDEO_MODELS[0].id);
  const [clipSeconds, setClipSeconds] = useState(6);
  const [clipFrom, setClipFrom] = useState("");

  const [voiceText, setVoiceText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);

  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicSeconds, setMusicSeconds] = useState(30);

  const [preset, setPreset] = useState("hustle");

  const uploadRef = useRef<HTMLInputElement>(null);
  const cloneRef = useRef<HTMLFormElement>(null);

  const images = assets.filter((asset) => asset.kind === "imagen");
  const inMontage = assets.filter((asset) => asset.included);

  const go = (id: string) => router.push(`/estudio?p=${id}`);

  return (
    <div className="space-y-6">
      {note ? (
        <p className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          {note}
        </p>
      ) : null}

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
                  {hasHiggsfield
                    ? cliModels.map((model) => (
                        <option key={model.slug} value={`hf:${model.slug}`}>
                          {model.name}
                        </option>
                      ))
                    : null}
                </SelectField>
              </div>

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
              <p className="text-sm font-medium">Animar una imagen</p>

              <SelectField
                value={clipFrom}
                onChange={(event) => setClipFrom(event.target.value)}
                className="mt-2 w-full"
              >
                <option value="">Elige la imagen…</option>
                {images.map((image) => (
                  <option key={image.id} value={image.url}>
                    {image.name || "Imagen"}
                  </option>
                ))}
              </SelectField>

              <input
                value={clipPrompt}
                onChange={(event) => setClipPrompt(event.target.value)}
                placeholder="Se lleva la mano al cuello, la cámara se acerca despacio"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <SelectField
                  value={clipModel}
                  onChange={(event) => setClipModel(event.target.value)}
                  className="min-w-44"
                >
                  {VIDEO_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} · ${model.usdPerSecond.toFixed(3)}/s
                    </option>
                  ))}
                </SelectField>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Segundos</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={clipSeconds}
                    onChange={(event) => setClipSeconds(Number(event.target.value))}
                    className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              </div>

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeClipAction({
                      projectId: current.id,
                      imageUrl: clipFrom,
                      prompt: clipPrompt,
                      model: clipModel,
                      seconds: clipSeconds,
                    })
                  }
                  label="Animar"
                  disabled={!clipFrom}
                  disabledReason={!clipFrom ? "Elige una imagen primero" : undefined}
                  hint={`Unos ${(clipSeconds * (VIDEO_MODELS.find((m) => m.id === clipModel)?.usdPerSecond ?? 0.015)).toFixed(2)} USD. Es lo caro del vídeo.`}
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
                    makeVoiceAction({ projectId: current.id, text: voiceText, voiceId })
                  }
                  label="Generar voz"
                  disabled={!voiceText.trim() || !voiceId}
                  disabledReason={!voiceId ? "Carga las voces y elige una" : undefined}
                  hint="Céntimos. Escribe fonético: «eme ce te» en vez de «MCT», o se pronuncia mal."
                />
              </div>

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

              <label className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-xs text-slate-500 dark:text-slate-400">Segundos</span>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={musicSeconds}
                  onChange={(event) => setMusicSeconds(Number(event.target.value))}
                  className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>

              <div className="mt-3">
                <GenerateButton
                  variant="primary"
                  action={() =>
                    makeMusicAction({
                      projectId: current.id,
                      prompt: musicPrompt,
                      seconds: musicSeconds,
                    })
                  }
                  label="Generar música"
                  disabled={!musicPrompt.trim()}
                  hint="Sale ya baja de volumen: el montaje mezcla sin control de volumen y a nivel normal taparía la voz."
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
