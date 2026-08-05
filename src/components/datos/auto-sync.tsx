"use client";

import { useEffect, useRef, useState } from "react";
import { syncSpendAction } from "@/app/datos/actions";

/**
 * Traer el gasto de Meta al abrir el panel, sin pedirlo.
 *
 * ## Por qué
 *
 * El gasto publicitario solo entra cuando alguien pulsa «Sincronizar». Así que
 * abrir el panel enseña las cifras de la última vez que a alguien se le ocurrió
 * pulsarlo — y el beneficio sale más alto del real, porque le falta el gasto de
 * hoy. Es el fallo silencioso de siempre: el número existe, es plausible y está
 * mal.
 *
 * ## Y por qué solo cada media hora
 *
 * Porque cada sincronización son varias llamadas a Meta por cada cuenta activa, y
 * abrir la misma pestaña seis veces en una tarde no da seis respuestas distintas:
 * el gasto de Meta se actualiza cada bastante. Media hora es el punto donde deja
 * de haber datos viejos sin gastar cupo en preguntar lo mismo.
 *
 * El momento se guarda **en este navegador** y no en el servidor a propósito: lo
 * que se quiere evitar es que *abrir la pestaña* dispare una sincronización cada
 * vez, y eso es una cosa del navegador. El botón de siempre sigue ahí para
 * pedirlo cuando quieras, sin esperar nada.
 */

/** Cada cuánto, como mucho, se pide solo. */
const EVERY_MS = 30 * 60_000;

function lastRun(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    // Modo privado o almacenamiento bloqueado: se sincroniza y ya.
    return 0;
  }
}

export function AutoSyncSpend({
  storeId,
  from,
  to,
  enabled,
}: {
  storeId: string;
  from: string;
  to: string;
  /** Falso si no hay cuentas activas: no hay nada que traer. */
  enabled: boolean;
}) {
  const [note, setNote] = useState("");

  /*
   * Una sola vez por montaje.
   *
   * En desarrollo React monta dos veces a propósito, y sin esto eso son dos
   * sincronizaciones — dos veces el cupo de Meta por abrir una pantalla.
   */
  const launched = useRef(false);

  useEffect(() => {
    if (!enabled || launched.current) return;

    launched.current = true;

    /*
     * Todo dentro de una función asíncrona.
     *
     * No es por gusto: cambiar el estado directamente en el cuerpo de un efecto
     * dispara otro renderizado antes de que el primero acabe de pintarse. Aquí
     * daría igual —es una línea de texto— pero es la clase de cosa que deja de
     * dar igual en cuanto el componente crece.
     */
    void (async () => {
      const key = `gasto-meta:${storeId}`;
      const since = Date.now() - lastRun(key);

      if (since < EVERY_MS) {
        const mins = Math.max(1, Math.round((EVERY_MS - since) / 60_000));

        setNote(
          `Gasto de Meta al día. Se vuelve a pedir solo en ${mins} min, o pulsa Sincronizar.`,
        );

        return;
      }

      setNote("Trayendo el gasto de Meta…");

      try {
        const result = await syncSpendAction(storeId, from, to);

        if (!result.started) {
          setNote(result.message);
          return;
        }

        try {
          localStorage.setItem(key, String(Date.now()));
        } catch {
          // Sin poder guardarlo se pedirá otra vez al abrir. Molesta menos que
          // no pedirlo nunca.
        }

        setNote("Trayendo el gasto de Meta… las cifras se actualizan al terminar.");
      } catch (error) {
        setNote(error instanceof Error ? error.message : "No se pudo traer el gasto.");
      }
    })();
  }, [enabled, storeId, from, to]);

  if (!note) return null;

  return <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>;
}
