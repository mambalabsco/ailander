"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresca la página mientras haya algo generándose.
 *
 * La generación ocurre en el servidor y sobrevive a que cierres la pestaña, así
 * que la interfaz no recibe ningún aviso cuando termina: hay que preguntar.
 *
 * Solo pregunta cuando hay algo en marcha. Un sondeo permanente golpearía la
 * base de datos cada pocos segundos en todas las pestañas abiertas para no
 * enterarse de nada el 99% del tiempo.
 *
 * No lleva cronómetro a propósito: mantenerlo exacto entre tandas obligaba a
 * guardar estado que había que reiniciar a mano, y un contador que arrastra el
 * tiempo de la tanda anterior informa peor que no tener contador.
 */
export function GenerationWatcher({
  active,
  intervalMs = 12_000,
}: {
  /** Cuántos documentos están generándose ahora mismo. */
  active: number;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (active === 0) return;

    const timer = setInterval(() => router.refresh(), intervalMs);

    return () => clearInterval(timer);
    // `active` en las dependencias: al terminar el último documento el efecto se
    // vuelve a evaluar, entra por la rama de arriba y el sondeo se para solo.
  }, [active, intervalMs, router]);

  if (active === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900 dark:bg-violet-950/40">
      <span
        className="size-2 shrink-0 animate-pulse rounded-full bg-violet-600 dark:bg-violet-400"
        aria-hidden
      />
      <p className="text-violet-900 dark:text-violet-200">
        Generando {active} documento{active === 1 ? "" : "s"} en el servidor. Puedes cerrar esta
        pestaña: la investigación sigue y el resultado te espera aquí.
      </p>
    </div>
  );
}
