"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import {
  generateStoreLogoAction,
  setStoreLogoAction,
  uploadStoreLogoAction,
} from "@/app/stores/logo-actions";

/**
 * El logo de una tienda: generarlo o pegar el propio.
 *
 * Las tres vías juntas porque son igual de legítimas. Quien ya tiene logo lo
 * sube y no paga nada; quien lo tiene en internet pega la dirección; quien no lo
 * tiene lo genera. Ofrecer solo la última obligaría a generar un logo a quien ya
 * tenía uno mejor.
 *
 * Subirlo es lo primero porque es donde suele estar: en el ordenador de quien lo
 * encargó. Pegar una dirección quedaba como única alternativa a generar, y
 * obligaba a subirlo antes a otro sitio — donde además caduca.
 *
 * Se enseña sobre un fondo a cuadros: los logos salen con fondo transparente y
 * sobre blanco no se ve si el fondo es transparente o blanco — que es justo lo
 * que hay que comprobar antes de ponerlo en una página oscura.
 */

const CHECKER =
  "repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";

export function StoreLogo({
  storeId,
  storeName,
  logoUrl,
  niche,
}: {
  storeId: string;
  storeName: string;
  logoUrl?: string;
  /** El nicho, para que el prompt no salga genérico. */
  niche?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-24 w-40 shrink-0 items-center justify-center rounded-2xl border border-slate-200 p-2 dark:border-slate-700"
          style={{ background: CHECKER }}
        >
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               Viene de un CDN externo y con proporción variable: `next/image`
               exigiría declarar el dominio y no optimiza lo que no sirve él. */
            <img
              src={logoUrl}
              alt={`Logo de ${storeName}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-500">sin logo</span>
          )}
        </div>

        <div className="min-w-56 flex-1 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Lo usan las landings, las creatividades y los vídeos. Antes se generaba dentro de cada
            página, así que dos páginas de la misma tienda salían con logos distintos.
          </p>

          <GenerateButton
            action={() => generateStoreLogoAction({ storeId, niche })}
            label={logoUrl ? "Generar otro" : "Generar el logo"}
            hint="Unos 0,02 USD. Wordmark plano, fondo transparente, legible en pequeño."
          />
        </div>
      </div>

      {/*
        Subirlo del ordenador, que es donde suele estar.

        Guarda solo al terminar: un logo se sube una vez y pedir además un clic
        en «guardar» es un paso que solo sirve para olvidarlo.
      */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Súbelo desde tu ordenador
        </span>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/svg+xml,image/jpeg"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            setUploading(true);
            setMessage("");

            const payload = new FormData();
            payload.set("storeId", storeId);
            payload.set("file", file);

            void uploadStoreLogoAction(payload)
              .then((result) => {
                setMessage(result.message);
                if (result.ok) router.refresh();
                if (fileRef.current) fileRef.current.value = "";
              })
              .catch((error: unknown) =>
                setMessage(error instanceof Error ? error.message : "No se pudo subir."),
              )
              .finally(() => setUploading(false));
          }}
          className="w-full text-xs file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs dark:file:bg-white/10 dark:file:text-slate-200"
        />

        <span className="text-xs text-slate-500 dark:text-slate-400">
          PNG, WebP o SVG. Un JPG no tiene transparencia y sobre fondo oscuro se le ve el recuadro
          blanco.
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            O pega una dirección, si ya está subido
          </span>
          <TextField
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…/logo.png"
          />
        </label>

        <Button
          disabled={isPending || !url.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await setStoreLogoAction(storeId, url);
              setMessage(result.message);
              if (result.ok) {
                setUrl("");
                router.refresh();
              }
            })
          }
        >
          Guardar
        </Button>

        {logoUrl ? (
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await setStoreLogoAction(storeId, "");
                router.refresh();
              })
            }
          >
            Quitar
          </Button>
        ) : null}
      </div>

      {uploading ? <p className="text-sm text-slate-500">Subiendo…</p> : null}

      {message && !uploading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      ) : null}
    </div>
  );
}
