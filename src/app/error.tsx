"use client";

import { useEffect } from "react";
import { adviseOn } from "@/lib/error-advice";

/**
 * La pantalla de error, con el arreglo dentro cuando se sabe cuál es.
 *
 * **En producción Next no deja pasar el mensaje del error.** Enseña un texto
 * genérico y un `digest`, para no filtrar detalles del servidor. Está bien de
 * cara a fuera y es horrible de cara a quien administra la plataforma: para
 * saber que faltaban unas migraciones hubo que entrar por SSH, encontrar el
 * servicio y filtrar `journalctl`.
 *
 * Por eso el `digest` se enseña siempre, con el comando para buscarlo: es la
 * única cuerda que conecta lo que se ve con la línea del registro. Y cuando el
 * mensaje **sí** llega y se reconoce, se pinta el comando que lo arregla.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const advice = adviseOn(error.message ?? "");

  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 dark:border-rose-900 dark:bg-rose-950/40">
      <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-200">
        {advice?.title ?? "Algo ha fallado"}
      </h2>

      <p className="mt-2 max-w-2xl text-sm text-rose-700 dark:text-rose-300">
        {advice?.explanation ?? error.message ?? "No hemos podido cargar esta sección."}
      </p>

      {advice?.command ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
            Se arregla con esto, en el servidor:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-rose-100 p-3 text-xs text-rose-900 dark:bg-rose-950 dark:text-rose-200">
            <code>{advice.command}</code>
          </pre>
        </div>
      ) : null}

      {advice?.where ? (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
          Dónde arreglarlo: <span className="font-medium">{advice.where}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
        >
          Reintentar
        </button>

        {/*
          El digest es lo único que enlaza esta pantalla con la traza del
          servidor cuando el mensaje viene censurado. Sin él hay que buscar por
          la hora, que en un servidor con tráfico es buscar a ciegas.
        */}
        {error.digest ? (
          <p className="text-xs text-rose-700 dark:text-rose-400">
            Referencia <code className="font-mono">{error.digest}</code> · búscala con{" "}
            <code className="font-mono">journalctl -u plataforma | grep {error.digest}</code>
          </p>
        ) : null}
      </div>

      {/*
        Si no se reconoció el error, se dice. Es más útil que un consejo
        plausible: un diagnóstico equivocado manda a mirar donde no es y cuesta
        más tiempo que no dar ninguno.
      */}
      {!advice ? (
        <p className="mt-4 text-xs text-rose-700 dark:text-rose-400">
          Este fallo no es de los conocidos. El detalle completo está en el registro:{" "}
          <code className="font-mono">journalctl -u plataforma -n 80 --no-pager</code>
        </p>
      ) : null}
    </div>
  );
}
