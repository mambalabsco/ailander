"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { tally } from "@/lib/avatar-shots";
import {
  deleteAvatarAction,
  deleteShotAction,
  generateAvatarsAction,
  generateShotsAction,
  updateAvatarAction,
  uploadAvatarsAction,
} from "@/app/avatares/actions";

/**
 * La mesa de avatares.
 *
 * ## El orden de la pantalla es el orden del trabajo
 *
 * Primero las caras —subirlas o generarlas—, después elegir cuáles entran, y al
 * final el producto y cuántas fotos. Es el orden en que se hace y en que hay que
 * leerlo: poner el generador de tomas arriba dejaría un botón que no se puede
 * pulsar hasta haber hecho dos cosas que están más abajo.
 *
 * ## Y el número de imágenes va delante del botón
 *
 * Porque multiplica. Seis caras por cinco fotos son treinta generaciones, y
 * desde el formulario eso no se ve: se ven un seis y un cinco.
 */

export interface AvatarView {
  id: string;
  name: string;
  url: string;
  description: string;
  source: string;
  shots: number;
}

export interface ShotView {
  id: string;
  avatarId: string;
  url: string;
  context: string;
}

export function AvatarBoard({
  avatars,
  products,
  current,
  shots,
  contexts,
  people,
  cliModels,
  higgsfield,
}: {
  avatars: AvatarView[];
  products: { id: string; name: string }[];
  current: { id: string; name: string } | null;
  shots: ShotView[];
  contexts: { id: string; label: string; note: string }[];
  people: { id: string; label: string; description: string }[];
  cliModels: { slug: string; name: string }[];
  higgsfield: { ok: boolean; reason: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadDescription, setUploadDescription] = useState("");

  const [person, setPerson] = useState("");
  const [model, setModel] = useState("");
  const [country, setCountry] = useState("");
  const [howMany, setHowMany] = useState(3);

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [perAvatar, setPerAvatar] = useState(3);
  const [pickedContexts, setPickedContexts] = useState<Set<string>>(new Set());
  const [holding, setHolding] = useState(true);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  /*
   * Soul primero si está.
   *
   * Es el que hace personas que parecen personas, y es la razón de que esto vaya
   * por el CLI. Quien abra la pantalla no tiene por qué saberlo.
   */
  const models = [...cliModels].sort((a, b) => {
    const soul = (item: { slug: string; name: string }) =>
      /soul/i.test(item.slug) || /soul/i.test(item.name) ? 0 : 1;

    return soul(a) - soul(b);
  });

  const plan = tally(chosen.size, perAvatar);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div className="space-y-6">
      {note ? (
        <p className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          {note}
        </p>
      ) : null}

      {/* ---------------------------- 1 · Las caras ----------------------- */}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-medium">Subir las tuyas</p>

          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="mt-2 w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-slate-800"
          />

          <input
            value={uploadDescription}
            onChange={(event) => setUploadDescription(event.target.value)}
            placeholder="Cómo son: mujer de 45, pelo oscuro, piel media…"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            La descripción se le pasa al generador para que no reinvente la cara al ponerle el
            producto. Se puede afinar después en cada una.
          </p>

          <Button
            className="mt-3"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const files = uploadRef.current?.files;
                if (!files || files.length === 0) {
                  setNote("Elige los archivos primero.");
                  return;
                }

                const payload = new FormData();
                for (const file of files) payload.append("files", file);
                payload.set("description", uploadDescription);

                const result = await uploadAvatarsAction(payload);
                setNote(result.message);

                if (result.ok && uploadRef.current) uploadRef.current.value = "";
                router.refresh();
              })
            }
          >
            {isPending ? "Subiendo…" : "Subir las caras"}
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-medium">O generar personas nuevas</p>

          {higgsfield.ok ? null : (
            <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {higgsfield.reason || "El CLI de Higgsfield no responde."} Sin él solo se pueden
              subir caras.
            </p>
          )}

          {/*
            Sugerencias, no plantillas cerradas: son un punto de partida para no
            empezar en un campo vacío, y se pueden reescribir enteras.
          */}
          <SelectField
            value={person}
            onChange={(event) => {
              setPerson(event.target.value);

              const found = people.find((item) => item.id === event.target.value);
              if (found) setUploadDescription(found.description);
            }}
            className="mt-2 w-full"
          >
            <option value="">Parte de una sugerencia…</option>
            {people.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </SelectField>

          <textarea
            value={uploadDescription}
            onChange={(event) => setUploadDescription(event.target.value)}
            rows={3}
            placeholder="a woman in her mid 40s, shoulder-length dark hair, medium skin, tired eyes…"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <SelectField
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="min-w-44"
            >
              <option value="">Elige el modelo…</option>
              {models.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </SelectField>

            <input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="País (opcional)"
              className="w-36 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Cuántas</span>
              <input
                type="number"
                min={1}
                max={10}
                value={howMany}
                onChange={(event) => setHowMany(Number(event.target.value))}
                className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <div className="mt-3">
            <GenerateButton
              action={() =>
                generateAvatarsAction({
                  description: uploadDescription,
                  model,
                  country,
                  count: howMany,
                })
              }
              label="Generar las caras"
              disabled={!higgsfield.ok || !uploadDescription.trim() || !model}
              disabledReason={
                !higgsfield.ok
                  ? "El CLI de Higgsfield no responde"
                  : !model
                    ? "Elige el modelo"
                    : "Describe cómo es la persona"
              }
              hint="Personas sintéticas, nunca fotos de gente real. Se guardan y sirven para todos los productos."
            />
          </div>
        </div>
      </div>

      {/* ------------------------- 2 · Elegir las caras -------------------- */}

      {avatars.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay ninguna cara. Sube unas cuantas o genéralas arriba.
        </p>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {chosen.size} de {avatars.length} elegidas
            </p>

            <Button
              variant="ghost"
              onClick={() =>
                setChosen(
                  chosen.size === avatars.length
                    ? new Set()
                    : new Set(avatars.map((avatar) => avatar.id)),
                )
              }
            >
              {chosen.size === avatars.length ? "Ninguna" : "Todas"}
            </Button>
          </div>

          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {avatars.map((avatar) => {
              const on = chosen.has(avatar.id);

              return (
                <li
                  key={avatar.id}
                  className={`rounded-2xl border p-2 ${
                    on
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setChosen(toggle(chosen, avatar.id))}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatar.url}
                      alt={avatar.name}
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  </button>

                  <p className="mt-1 truncate text-xs font-medium">{avatar.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {avatar.shots > 0 ? `${avatar.shots} foto(s)` : "sin fotos"} ·{" "}
                    {avatar.source === "subido" ? "subida" : "generada"}
                  </p>

                  {editing === avatar.id ? (
                    <div className="mt-1 space-y-1">
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        rows={2}
                        placeholder="Cómo es"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                      <Button
                        variant="ghost"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await updateAvatarAction(
                              avatar.id,
                              editName,
                              editDescription,
                            );
                            setNote(result.message);
                            setEditing(null);
                            router.refresh();
                          })
                        }
                      >
                        Guardar
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(avatar.id);
                          setEditName(avatar.name);
                          setEditDescription(avatar.description);
                        }}
                        className="text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                      >
                        editar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`¿Borrar «${avatar.name}» y sus fotos?`)) return;

                          startTransition(async () => {
                            await deleteAvatarAction(avatar.id);
                            router.refresh();
                          });
                        }}
                        className="text-xs text-slate-400 underline-offset-2 hover:underline"
                      >
                        borrar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* --------------------- 3 · El producto y las fotos ------------------ */}

      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <p className="text-sm font-medium">Ponerles el producto</p>

        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Producto</span>
            <SelectField
              value={current?.id ?? ""}
              onChange={(event) => router.push(`/avatares?producto=${event.target.value}`)}
              className="min-w-56"
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </SelectField>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Fotos por cara</span>
            <input
              type="number"
              min={1}
              max={10}
              value={perAvatar}
              onChange={(event) => setPerAvatar(Number(event.target.value))}
              className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={holding}
              onChange={(event) => setHolding(event.target.checked)}
            />
            <span>Con el producto en la mano</span>
          </label>
        </div>

        {/*
          Los contextos, y por qué se eligen.

          Pedir cinco fotos sin decir dónde devuelve cinco veces la misma cocina.
          Sin marcar ninguno se reparten todos, que es lo que se quiere casi
          siempre.
        */}
        <div className="mt-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Contextos {pickedContexts.size > 0 ? `· ${pickedContexts.size}` : "· todos"}
          </p>

          <ul className="mt-1 flex flex-wrap gap-2">
            {contexts.map((context) => {
              const on = pickedContexts.has(context.id);

              return (
                <li key={context.id}>
                  <button
                    type="button"
                    title={context.note}
                    onClick={() => setPickedContexts(toggle(pickedContexts, context.id))}
                    className={`rounded-xl border px-2 py-1 text-xs ${
                      on
                        ? "border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    {context.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-3">
          <GenerateButton
            variant="primary"
            action={() =>
              generateShotsAction({
                productId: current?.id ?? "",
                avatarIds: [...chosen],
                perAvatar,
                contexts: [...pickedContexts],
                holding,
              })
            }
            label={`Generar ${plan.images} foto(s)`}
            disabled={!current || chosen.size === 0}
            disabledReason={
              !current ? "Elige el producto" : "Elige al menos una cara arriba"
            }
            hint={`${chosen.size} cara(s) × ${perAvatar} = ${plan.images} imágenes, unos ${plan.usd.toFixed(2)} USD. Lleva la foto de tu envase como referencia.`}
          />
        </div>
      </div>

      {/* ----------------------------- El resultado ------------------------ */}

      {shots.length > 0 ? (
        <div>
          <p className="text-sm font-medium">
            {shots.length} foto(s) de {current?.name}
          </p>

          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {shots.map((shot) => (
              <li key={shot.id} className="rounded-2xl border border-slate-200 p-2 dark:border-slate-800">
                <a href={shot.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.url}
                    alt={shot.context}
                    className="aspect-[4/5] w-full rounded-xl object-cover"
                  />
                </a>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {contexts.find((context) => context.id === shot.context)?.label ?? shot.context}
                  </span>

                  <button
                    type="button"
                    aria-label="Borrar esta foto"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteShotAction(shot.id);
                        router.refresh();
                      })
                    }
                    className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
