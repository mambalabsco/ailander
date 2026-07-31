"use client";

import { useId, useMemo, useRef, useState } from "react";
import { search } from "@/lib/locales";

/**
 * Un campo con buscador y lista de sugerencias.
 *
 * ## Sugiere, no obliga
 *
 * Se puede escribir cualquier cosa. La lista cubre los mercados que se usan y
 * los grandes del resto, pero no el mundo entero, y bloquear lo que no está
 * dejaría a alguien sin poder añadir su país. Lo que evita el error no es
 * impedir escribir: es que lo correcto esté a un clic y salga primero.
 *
 * ## Filtra por nombre y por código
 *
 * Quien sabe que Chile es `CL` escribe «cl»; quien no, escribe «chile». Y se
 * busca sin acentos, porque nadie los pone al teclear rápido — sin eso, «mexico»
 * no encuentra «México», que es justo uno de los dos mercados del proyecto.
 */

export interface ComboOption {
  code: string;
  name: string;
  /** Lo que se enseña a la derecha: la moneda del país, el código del idioma. */
  hint?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  /** Si el valor que se guarda es el código en vez del nombre. */
  useCode = false,
  className = "",
}: {
  value: string;
  onChange: (value: string, option?: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  useCode?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mientras está abierto se filtra por lo escrito; cerrado se enseña el valor.
  const matches = useMemo(() => search(options, open ? query : "").slice(0, 40), [
    options,
    query,
    open,
  ]);

  const pick = (option: ComboOption) => {
    onChange(useCode ? option.code : option.name, option);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          // Se propaga al escribir: si nadie elige de la lista, lo tecleado vale.
          onChange(event.target.value);
        }}
        /*
         * El cierre se retrasa un poco a propósito.
         *
         * Al pulsar una opción, el `blur` del campo llega antes que el `click`
         * de la lista. Cerrando en el acto, la lista desaparece antes de que el
         * clic la alcance y no se puede elegir nada con el ratón.
         */
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && matches[0]) {
            event.preventDefault();
            pick(matches[0]);
          }
        }}
        className={`w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 ${className}`}
      />

      {open && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          // Cancela el cierre pendiente: el ratón ya está dentro de la lista.
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                role="option"
                aria-selected={value === (useCode ? option.code : option.name)}
                onClick={() => pick(option)}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span>{option.name}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {option.hint ?? option.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
