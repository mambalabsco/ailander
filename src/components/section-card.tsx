"use client";

import { useSyncExternalStore } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * La tarjeta de una sección, que se abre y se cierra.
 *
 * ## Por qué se puede cerrar
 *
 * Porque estas pantallas acumulan: la de tiendas lleva productos, tema, plan,
 * páginas de producto y la guía de conexión, y quien entra a hacer una cosa
 * baja pasando por las otras cuatro. Cerrada, una sección sigue estando —con su
 * título, que es lo que dice que existe— pero deja de ocupar pantalla.
 *
 * ## Por qué se recuerda
 *
 * Porque cerrar algo que vuelve abierto al recargar no es cerrar, es esconder
 * un momento. Se guarda en el navegador y por título: es lo que identifica a la
 * tarjeta sin depender de en qué orden estén, así que reordenar la página no
 * mezcla las decisiones de una con las de otra.
 *
 * Y se guarda **solo lo cerrado**. La lista queda corta —casi todo se deja
 * abierto— y, si un día se borra, todo vuelve a estar visible en vez de todo
 * escondido, que es el fallo que da miedo.
 */

const CLAVE = "secciones-cerradas";

/*
 * Un almacén de verdad, y no un estado corregido al montar.
 *
 * Leer el almacenamiento durante el pintado daría un marcado distinto en el
 * servidor y en el navegador, y corregirlo después con un efecto deja parpadear
 * las tarjetas cerradas. `useSyncExternalStore` es justo para esto: el servidor
 * pinta «nada cerrado» y el navegador lo sustituye sin pasar por un estado
 * intermedio.
 *
 * Y siendo un almacén compartido, cerrar una tarjeta avisa a todas: sin eso,
 * dos tarjetas con el mismo título se quedarían en desacuerdo.
 */
const oyentes = new Set<() => void>();

/*
 * La cadena cruda se cachea porque la comparación es por identidad.
 *
 * Devolviendo un objeto nuevo en cada consulta, React lo lee como un cambio y
 * vuelve a pintar sin parar. Se guarda lo último leído y solo se cambia cuando
 * de verdad cambia.
 */
let ultimo = "[]";

function snapshot(): string {
  try {
    const raw = window.localStorage.getItem(CLAVE) ?? "[]";
    if (raw !== ultimo) ultimo = raw;
  } catch {
    // Sin almacenamiento —modo privado, permisos— todo queda abierto.
  }

  return ultimo;
}

function subscribe(fn: () => void): () => void {
  oyentes.add(fn);

  return () => {
    oyentes.delete(fn);
  };
}

function leerCerradas(raw: string): Set<string> {
  try {
    const lista = JSON.parse(raw) as unknown;

    return new Set(Array.isArray(lista) ? lista.filter((one) => typeof one === "string") : []);
  } catch {
    return new Set();
  }
}

export function SectionCard({ title, description, children, action }: SectionCardProps) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const cerradas = leerCerradas(raw);

  /*
   * Abierta salvo que se haya cerrado. No hay opción de «empieza cerrada».
   *
   * Guardando **solo lo cerrado**, una tarjeta que naciera cerrada no se podría
   * volver a abrir: al abrirla se borraría de la lista y volvería a su valor de
   * origen, que es cerrada. Se puede resolver guardando también lo abierto, pero
   * eso es una lista que crece con cada tarjeta de la aplicación para un caso
   * que hoy no usa nadie.
   */
  const open = !cerradas.has(title);

  const cambiar = () => {
    const siguiente = !open;

    if (siguiente) cerradas.delete(title);
    else cerradas.add(title);

    try {
      window.localStorage.setItem(CLAVE, JSON.stringify([...cerradas]));
    } catch {
      // Sin almacenamiento —modo privado, permisos— se abre y se cierra igual;
      // lo único que se pierde es que lo recuerde. No merece romper nada.
    }

    for (const oyente of oyentes) oyente();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/8 dark:bg-white/[0.02]">
      <div className={`flex items-start justify-between gap-3 ${open ? "mb-4" : ""}`}>
        {/*
          El título entero es el botón, no un icono pequeño al lado.
          Un objetivo del ancho de la tarjeta se acierta sin apuntar, y es el
          gesto que más se repite en una pantalla con seis secciones.
        */}
        <button
          type="button"
          onClick={cambiar}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span
              aria-hidden
              className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            >
              ›
            </span>
            {title}
          </h2>

          {/*
            La descripción se va con el contenido.
            Cerrada, una tarjeta tiene que caber en una línea: si se queda el
            párrafo, seis secciones cerradas ocupan lo mismo que dos abiertas y
            cerrar deja de servir para nada.
          */}
          {description && open ? (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </button>

        {action && open ? <div className="shrink-0">{action}</div> : null}
      </div>

      {open ? children : null}
    </section>
  );
}
