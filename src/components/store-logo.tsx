"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { generateStoreLogoAction, setStoreLogoAction } from "@/app/stores/logo-actions";

/**
 * El logo de una tienda: generarlo o pegar el propio.
 *
 * Las dos vías juntas porque son igual de legítimas. Quien ya tiene logo lo pega
 * y no paga nada; quien no lo tiene lo genera. Ofrecer solo la segunda obligaría
 * a generar un logo a quien ya tenía uno mejor.
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

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            O pega el tuyo, si ya lo tienes
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

      {message ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      ) : null}
    </div>
  );
}
