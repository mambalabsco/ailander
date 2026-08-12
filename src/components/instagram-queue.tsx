"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SelectField } from "@/components/ui";
import { FORMATS, visiblePart } from "@/lib/instagram/content";
import { CopyableBlock } from "@/components/copyable";
import {
  deleteInstagramPostAction,
  generatePostMediaAction,
  planWeekAction,
  generateInstagramAction,
  updateInstagramPostAction,
} from "@/app/products/[id]/instagram-actions";
import type { Post } from "@/lib/data/instagram";

const ESTADOS: Record<string, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  publicando: "Publicándose",
  publicado: "Publicado",
  error: "Falló",
};

/**
 * La cola de Instagram: lo que va a salir, y cuándo.
 *
 * ## Por qué se enseña la parte cortada
 *
 * Porque Instagram corta el pie a los ~125 caracteres y eso no se ve al
 * escribirlo. Aquí se enseña **lo que se leerá sin pulsar «más»** en negrita y
 * el resto apagado: si el gancho cae al otro lado del corte, se nota antes de
 * publicar y no después.
 */
export function InstagramQueue({
  productId,
  posts,
}: {
  productId: string;
  posts: Post[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [format, setFormat] = useState("feed");
  const [count, setCount] = useState(3);
  const [note, setNote] = useState("");
  /*
   * Aprobar al crear.
   *
   * Apagado por defecto y con el aviso al lado: encenderlo significa que el
   * texto y la imagen que salen a la cuenta de la marca no los va a leer nadie.
   * Es una decisión legítima, pero tiene que tomarse a propósito.
   */
  const [auto, setAuto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await fn();

      setNote(result.message);
      if (result.ok) router.refresh();
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Formato</span>
          <SelectField value={format} onChange={(event) => setFormat(event.target.value)}>
            {FORMATS.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Cuántas</span>
          <SelectField value={String(count)} onChange={(event) => setCount(Number(event.target.value))}>
            {[1, 3, 5, 10].map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </SelectField>
        </label>

        <Button
          variant="primary"
          disabled={pending || !productId}
          onClick={() => correr(() => generateInstagramAction({ productId, format, count, auto }))}
        >
          {pending ? "Escribiendo…" : "Escribir publicaciones"}
        </Button>

        {/*
          Planificar va al lado de escribir y no escondido: es la forma de
          usarlo cuando ya se confía, y «dame tres» la de cuando se está
          probando algo concreto.
        */}
        <Button
          variant="secondary"
          disabled={pending || !productId}
          onClick={() => correr(() => planWeekAction({ productId, days: 7, auto }))}
        >
          {pending ? "…" : "Planificar la semana"}
        </Button>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => setAuto(event.target.checked)}
            className="size-4"
          />
          Aprobar solo
        </label>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {auto
            ? "Saldrán sin que nadie las lea. La imagen se genera igual después."
            : "Salen en borrador. La imagen o el vídeo se generan después, cuando decidas cuáles valen."}
        </span>
      </div>

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}

      {posts.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay nada en la cola.
        </p>
      ) : null}

      <ul className="grid gap-2">
        {posts.map((post) => (
          <li key={post.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {FORMATS.find((one) => one.id === post.format)?.label ?? post.format} ·{" "}
                {ESTADOS[post.status] ?? post.status}
                {post.scheduledAt
                  ? ` · ${new Date(post.scheduledAt).toLocaleString("es-ES")}`
                  : ""}
              </span>

              <div className="flex flex-wrap gap-2">
                {post.status === "borrador" ? (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      correr(() =>
                        updateInstagramPostAction({ id: post.id, productId, status: "aprobado" }),
                      )
                    }
                  >
                    Aprobar
                  </Button>
                ) : null}

                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setEditando(editando === post.id ? null : post.id);
                    setTexto(post.caption);
                  }}
                >
                  Editar
                </Button>

                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    correr(() => deleteInstagramPostAction({ id: post.id, productId }))
                  }
                >
                  Borrar
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              {/*
                La imagen a la izquierda y el texto a la derecha: es el orden en
                el que se publica —se elige la foto y se pega el pie—, y verlos
                juntos es lo que dice si pegan el uno con el otro.
              */}
              <div className="w-40">
                {post.mediaUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.mediaUrl}
                      alt=""
                      className="w-40 rounded-xl border border-slate-200 dark:border-slate-800"
                    />
                    <a
                      href={post.mediaUrl}
                      download
                      className="mt-1 inline-block text-xs text-violet-600 underline underline-offset-4 dark:text-violet-400"
                    >
                      Descargar
                    </a>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={pending || !post.scene}
                    onClick={() =>
                      correr(() => generatePostMediaAction({ id: post.id, productId }))
                    }
                  >
                    {pending ? "…" : "Generar imagen"}
                  </Button>
                )}
              </div>

              <div>
                {/*
                  Todo el pie en un bloque que se copia de una vez: es lo que se
                  pega en Instagram, con sus etiquetas incluidas. Copiarlo a
                  trozos es donde se pierden las etiquetas o el salto de línea
                  que deja el gancho solo.
                */}
                <CopyableBlock value={post.caption} label="el pie">
                  <p className="text-sm leading-6">
                    <strong>{visiblePart(post.caption)}</strong>
                    <span className="text-slate-400">
                      {post.caption.slice(visiblePart(post.caption).length)}
                    </span>
                  </p>
                </CopyableBlock>
              </div>
            </div>

            {post.scene ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Se ve: {post.scene}
              </p>
            ) : null}

            {post.error ? (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{post.error}</p>
            ) : null}

            {editando === post.id ? (
              <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <textarea
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  rows={6}
                  className="rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    defaultValue={post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""}
                    onChange={(event) =>
                      correr(() =>
                        updateInstagramPostAction({
                          id: post.id,
                          productId,
                          scheduledAt: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : "",
                        }),
                      )
                    }
                    className="rounded-xl border border-slate-200 px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-950"
                  />

                  <Button
                    variant="primary"
                    disabled={pending}
                    onClick={() =>
                      correr(() =>
                        updateInstagramPostAction({ id: post.id, productId, caption: texto }),
                      )
                    }
                  >
                    Guardar texto
                  </Button>

                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {texto.length} / 2200 caracteres
                  </span>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
