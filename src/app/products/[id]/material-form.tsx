"use client";

import { useRef, useState } from "react";
import { Field, TextAreaField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { analyzeMaterialAction } from "@/app/products/[id]/material-actions";

/**
 * Dar a la plataforma un anuncio que funcionó, para destriparlo.
 *
 * Los vídeos se eligen entre los **ya analizados**: analizar uno es un trabajo
 * largo que ya existe y tiene su pantalla. Repetirlo aquí serían dos caminos que
 * hacen lo mismo, y dos caminos que hacen lo mismo acaban divergiendo.
 */
export function MaterialForm({
  productId,
  videoReferences,
  hasApiKey,
}: {
  productId: string;
  /** Vídeos ya analizados: de ahí salen sus análisis, no el vídeo. */
  videoReferences: { id: string; name: string }[];
  hasApiKey: boolean;
}) {
  const [copy, setCopy] = useState("");
  const [propio, setPropio] = useState(false);
  const [videos, setVideos] = useState<string[]>([]);
  const imagenesRef = useRef<HTMLInputElement>(null);

  const corto = copy.trim().length < 200;

  return (
    <div className="space-y-3">
      <Field label="El copy que funcionó, entero">
        <TextAreaField
          rows={10}
          value={copy}
          onChange={(event) => setCopy(event.target.value)}
          placeholder="Pega el anuncio completo, tal y como se publicó."
        />
      </Field>

      {/*
        De quién es no es una etiqueta: decide qué se puede reutilizar después.
        De lo ajeno solo se hereda la construcción, porque una cifra de otro
        anuncio es algo que dijo otro sobre otro producto.
      */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={propio}
          onChange={(event) => setPropio(event.target.checked)}
          className="mt-1 size-4 accent-violet-600"
        />
        <span>
          <span className="font-medium">Es mío y ya lo lancé</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            De lo tuyo se puede reutilizar una promesa concreta y sus cifras, que están
            comprobadas. De lo ajeno, solo cómo está construido.
          </span>
        </span>
      </label>

      <Field label="Imágenes del anuncio (opcional)">
        <input type="file" accept="image/*" multiple ref={imagenesRef} className="text-sm" />
      </Field>

      {videoReferences.length > 0 ? (
        <Field label="Vídeos ya analizados que se lanzaron con este copy">
          <div className="space-y-1">
            {videoReferences.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={videos.includes(item.id)}
                  onChange={(event) =>
                    setVideos((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                  className="size-4 accent-violet-600"
                />
                {item.name}
              </label>
            ))}
          </div>
        </Field>
      ) : null}

      <GenerateButton
        action={() => {
          const payload = new FormData();
          payload.set("productId", productId);
          payload.set("copy", copy);
          payload.set("ownership", propio ? "propio" : "ajeno");
          for (const id of videos) payload.append("videoReferenceIds", id);
          for (const file of imagenesRef.current?.files ?? []) payload.append("imagenes", file);

          return analyzeMaterialAction(payload);
        }}
        label="Analizar el material"
        disabled={!hasApiKey || corto}
        disabledReason={
          corto ? "Pega el copy entero: con un fragmento no hay anatomía que sacar" : undefined
        }
        hint="Una llamada. Después podrás corregir la anatomía antes de sacar ángulos."
      />
    </div>
  );
}
