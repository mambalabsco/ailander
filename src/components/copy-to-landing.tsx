"use client";

import { useState } from "react";
import { Button, SelectField } from "@/components/ui";
import { GenerateButton } from "@/components/generate-button";
import { generateLandingAction } from "@/app/products/[id]/landing-actions";

/**
 * Convertir un copy ya escrito en una página de Shopify.
 *
 * ## Por qué hacía falta
 *
 * El generador de páginas **sí** sabía partir de un copy existente —el prompt
 * tenía su parámetro `baseCopy` desde el principio— pero **nadie se lo mandaba
 * nunca**. El botón vivía en el panel de crear un copy nuevo, así que la página
 * se escribía siempre desde cero aunque hubiera un long copy aprobado justo al
 * lado. Era código muerto que parecía funcionalidad.
 *
 * Poner el botón **en cada copy** es lo que lo arregla, y además es donde se
 * busca: la decisión de «esto merece una página» se toma leyendo el copy, no
 * antes de escribirlo.
 *
 * ## El aviso de coste
 *
 * Se enseña siempre y antes de pulsar. Una página completa son unos veinte
 * céntimos, que no es mucho, pero generar cuatro sin querer sí se nota — y en
 * este proyecto ya se perdió dinero por no ver lo que costaba una acción antes
 * de lanzarla.
 */

export function CopyToLanding({
  productId,
  copyId,
  methodId,
  angleId,
  /** Copys y páginas guardados en el archivo, para usar de modelo. */
  references,
  /** Páginas de tiendas analizadas, para escribir siguiendo su construcción. */
  modelPages = [],
  hasApiKey,
  /** Si ya existe una página nacida de este copy. */
  alreadyHasLanding,
}: {
  productId: string;
  copyId: string;
  methodId: string;
  angleId?: string;
  references: { id: string; title: string }[];
  modelPages?: { id: string; title: string }[];
  hasApiKey: boolean;
  alreadyHasLanding?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [commentStyle, setCommentStyle] = useState<"facebook" | "testimonios">("facebook");
  const [referenceId, setReferenceId] = useState("");
  const [fidelity, setFidelity] = useState<"calcado" | "inspirado">("calcado");

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Convertir en página
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Convertir este copy en una página</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            El texto de arriba se reparte en secciones, se le añaden autor, valoraciones,
            comentarios y oferta, y quedan los huecos de imagen listos para generar.
          </p>
        </div>
        <Button onClick={() => setOpen(false)}>Cancelar</Button>
      </div>

      {/*
        Se avisa en vez de impedirlo. Puede ser deliberado —dos versiones de la
        misma página para repartir tráfico entre ellas— y bloquearlo obligaría a
        borrar la primera para probar una segunda.
      */}
      {alreadyHasLanding ? (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Ya hay una página hecha con este copy. Generar otra no borra la anterior: quedan las dos,
          y puedes repartir tráfico entre ellas en Pruebas A/B.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Comentarios</span>
          <SelectField
            value={commentStyle}
            onChange={(event) =>
              setCommentStyle(event.target.value as "facebook" | "testimonios")
            }
          >
            <option value="facebook">Estilo Facebook, tono local de móvil</option>
            <option value="testimonios">Testimonios con nombre y edad</option>
          </SelectField>
        </label>

        {references.length > 0 || modelPages.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Página de referencia
            </span>
            <SelectField
              value={referenceId}
              onChange={(event) => setReferenceId(event.target.value)}
            >
              <option value="">Sin referencia</option>
              {/*
                Los dos orígenes van separados porque no se eligen igual. Del
                archivo se escoge un texto que ya funcionó; de una tienda
                analizada se escoge una página que hay que reconstruir con otro
                producto. Mezclarlos en una lista plana esconde esa diferencia.
              */}
              {references.length > 0 ? (
                <optgroup label="Tu archivo">
                  {references.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {modelPages.length > 0 ? (
                <optgroup label="Tiendas analizadas">
                  {modelPages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </SelectField>
          </label>
        ) : null}

        {referenceId ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cuánto seguirla
            </span>
            <SelectField
              value={fidelity}
              onChange={(event) => setFidelity(event.target.value as "calcado" | "inspirado")}
            >
              <option value="calcado">Calcada — misma estructura</option>
              <option value="inspirado">Inspirada — página nueva</option>
            </SelectField>
          </label>
        ) : null}
      </div>

      <GenerateButton
        variant="primary"
        action={() =>
          generateLandingAction({
            productId,
            // Esto es lo que faltaba: sin `copyId` la página se escribía desde
            // cero e ignoraba el texto que tenía justo al lado.
            copyId,
            methodId,
            angleId: angleId ?? "",
            commentStyle,
            referenceId,
            fidelity,
          })
        }
        label="Crear la página con este copy"
        disabled={!hasApiKey}
        disabledReason={!hasApiKey ? "Configura tu clave de API en Configuración" : undefined}
        hint="Unos 0,20 USD. Corre en segundo plano: puedes cerrar la pestaña."
      />
    </div>
  );
}
