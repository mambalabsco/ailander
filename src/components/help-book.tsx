"use client";

import { useMemo, useState } from "react";
import { HELP, searchHelp } from "@/lib/help";

/**
 * El manual, con el buscador arriba.
 *
 * Los artículos se abren y se cierran. Con el buscador escrito se abren solos:
 * quien ha buscado ya ha dicho qué quiere leer, y obligarle a un clic más sobre
 * el único resultado es pedirle que confirme lo que acaba de pedir.
 */
export function HelpBook() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const found = useMemo(() => searchHelp(query), [query]);
  const buscando = query.trim().length > 2;

  return (
    <div className="grid gap-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="¿Qué necesitas hacer? «mi vídeo sale sin voz», «permisos de shopify»…"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
      />

      {found.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nada con esas palabras. Prueba con lo que ves en pantalla o con lo que falla —«no se
          publica», «sale pequeño»—, que es como están escritas las fichas.
        </p>
      ) : null}

      <div className="grid gap-2">
        {found.map((article) => {
          const abierto = buscando || open === article.id;

          return (
            <div
              key={article.id}
              className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => setOpen(abierto && !buscando ? null : article.id)}
                className="w-full text-left"
              >
                <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
                  {article.title}
                  {/* Dónde está, siempre visible: entenderlo y no saber dónde
                      encontrarlo deja el trabajo a medias. */}
                  <span className="text-xs font-normal text-violet-600 dark:text-violet-400">
                    {article.where}
                  </span>
                </p>
                <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                  {article.summary}
                </p>
              </button>

              {abierto ? (
                <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-[13px] leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {article.body.map((parrafo, at) => (
                    <p key={at}>{parrafo}</p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {found.length} de {HELP.length} fichas.
      </p>
    </div>
  );
}
