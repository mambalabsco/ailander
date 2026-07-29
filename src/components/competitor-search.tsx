"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@/components/ui";
import { useJobResult } from "@/components/use-job-result";
import { GenerateButton } from "@/components/generate-button";
import {
  addCompetitorUrlsAction,
  searchCompetitorsAction,
  type CompetitorCandidate,
} from "@/app/products/[id]/generate-actions";

/**
 * Buscar competidores con IA y confirmar cuáles entran.
 *
 * **Los candidatos no se guardan solos.** El documento 2 es de los caros, y
 * arranca de esta lista: un competidor que no lo es de verdad —una farmacia,
 * un marketplace, una marca de otro país— arrastra el error a toda la
 * investigación. Aquí el modelo propone y tú decides.
 *
 * Cada candidato viene con su confianza y con por qué compite, para que la
 * decisión no sea a ciegas.
 */

const CONFIDENCE_STYLES: Record<string, string> = {
  alta: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  media: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  baja: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function CompetitorSearch({
  productId,
  hasApiKey,
  label = "Buscar competidores con IA",
}: {
  productId: string;
  hasApiKey: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<CompetitorCandidate[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // El trabajo corre en el servidor; aquí solo se le sigue la pista.
  const [jobId, setJobId] = useState<string | null>(null);
  // El tercer argumento recupera la última búsqueda terminada al entrar: sin él,
  // recargar la página dejaba los candidatos inalcanzables.
  const { job, isRunning } = useJobResult(jobId, 4000, { productId, kind: "competidores" });

  /*
   * Los candidatos llegan cuando el trabajo termina, no cuando se pulsa.
   *
   * Se copian al estado local porque a partir de aquí son editables: marcas y
   * desmarcas cuáles entran. Leerlos directos del trabajo obligaría a mantener
   * esa selección en otro sitio.
   *
   * El ajuste va **en el render**, no en un efecto. Es el patrón que React
   * documenta para adaptar estado a datos nuevos: con un efecto se pintaría
   * primero la lista vacía y luego la llena, provocando un parpadeo.
   */
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null);

  if (job?.status === "done" && job.id !== loadedJobId) {
    const found = (job.result as { candidates?: CompetitorCandidate[] } | null)?.candidates ?? [];
    setLoadedJobId(job.id);
    setCandidates(found);
    // Los de confianza alta vienen marcados; los demás los decides tú.
    setAccepted(new Set(found.filter((item) => item.confidence === "alta").map((item) => item.url)));
  }

  const toggle = (url: string) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const save = () => {
    startTransition(async () => {
      const added = await addCompetitorUrlsAction(productId, [...accepted]);
      setSaved(added);
      setCandidates([]);
      setAccepted(new Set());
      router.refresh();
    });
  };

  return (
    <div className="w-full">
      <GenerateButton
        action={async () => {
          setSaved(null);
          setCandidates([]);
          const result = await searchCompetitorsAction(productId);
          // Los candidatos ya no vienen aquí: el trabajo corre en el servidor.
          // `onStarted` deja el id y el sondeo los recoge cuando termine.
          return result;
        }}
        onStarted={setJobId}
        label={label}
        disabled={!hasApiKey}
        disabledReason="Configura tu clave de API en Configuración"
        hint="Busca en la web marcas DTC de tu nicho y país. Unos 0,25 USD."
      />

      {isRunning ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Buscando en la web... Puedes cerrar la pestaña y volver.
        </p>
      ) : null}

      {saved !== null ? (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {saved === 0
            ? "No añadiste ninguno."
            : `${saved} competidor(es) añadidos a la ficha del producto.`}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-4 rounded-3xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="font-medium">Revisa antes de añadir</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            El documento 2 arranca de esta lista. Un competidor que no lo es arrastra el error a
            toda la investigación, así que quita lo que no encaje.
          </p>

          <div className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <label
                key={candidate.url}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <input
                  type="checkbox"
                  checked={accepted.has(candidate.url)}
                  onChange={() => toggle(candidate.url)}
                  className="mt-1 size-4 accent-violet-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{candidate.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        CONFIDENCE_STYLES[candidate.confidence] ?? CONFIDENCE_STYLES.baja
                      }`}
                    >
                      confianza {candidate.confidence}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-violet-600">
                    {candidate.url}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                    {candidate.whyItCompetes}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={save} disabled={isPending || accepted.size === 0}>
              {isPending ? "Añadiendo..." : `Añadir ${accepted.size} al producto`}
            </Button>
            <Button
              onClick={() => {
                setCandidates([]);
                setAccepted(new Set());
              }}
              disabled={isPending}
            >
              Descartar todos
            </Button>
            <Tag>{candidates.length} propuestos</Tag>
          </div>
        </div>
      ) : null}
    </div>
  );
}
