"use client";

import { useEffect } from "react";

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

  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950/40">
      <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-200">Algo ha fallado</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-rose-700 dark:text-rose-300">
        {error.message || "No hemos podido cargar esta sección."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
      >
        Reintentar
      </button>
    </div>
  );
}
