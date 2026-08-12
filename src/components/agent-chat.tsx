"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { agentChatAction } from "@/app/products/[id]/agent-actions";

interface Turn {
  role: "tú" | "agente";
  text: string;
  /** Lo que hizo de verdad, aparte de lo que dice. */
  did?: string[];
}

/**
 * Hablar con el agente.
 *
 * ## Por qué se enseña aparte lo que hizo
 *
 * Porque un agente con herramientas puede decir «he preparado tres» y no haber
 * preparado ninguna — suena igual de bien en los dos casos. Separando lo que
 * **dice** de lo que **hizo**, la diferencia se ve sin ir a comprobarla.
 */
export function AgentChat({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");

  const enviar = () => {
    const message = text.trim();
    if (!message) return;

    setText("");
    setTurns((prev) => [...prev, { role: "tú", text: message }]);

    start(async () => {
      const result = await agentChatAction({
        productId,
        message,
        // Las últimas diez: lo de más atrás ya no cambia lo que hay que hacer
        // ahora, y viaja en cada mensaje.
        history: turns.slice(-10).map((one) => ({ role: one.role, text: one.text })),
      });

      setTurns((prev) => [
        ...prev,
        { role: "agente", text: result.reply, did: result.did },
      ]);

      // La cola pudo cambiar: se recarga para verlo sin recargar a mano.
      if (result.did.length > 0) router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {turns.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dile qué quieres. «Planifica la semana insistiendo en el sueño», «mira la cola y dime
            qué falta», «tres reels sin que salga el producto».
          </p>
        ) : null}

        {turns.map((turn, at) => (
          <div
            key={at}
            className={`rounded-2xl border p-3 text-sm ${
              turn.role === "tú"
                ? "border-slate-200 dark:border-slate-800"
                : "border-violet-200 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/20"
            }`}
          >
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{turn.role}</p>
            <p className="whitespace-pre-wrap leading-6">{turn.text}</p>

            {/* Lo que hizo, aparte de lo que dice. */}
            {turn.did && turn.did.length > 0 ? (
              <ul className="mt-2 grid gap-1 border-t border-violet-200 pt-2 text-xs text-violet-800 dark:border-violet-900 dark:text-violet-300">
                {turn.did.map((one, i) => (
                  <li key={i}>· {one}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}

        {pending ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Pensando…</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              enviar();
            }
          }}
          placeholder="Habla con el agente…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
        />

        <Button variant="primary" disabled={pending || !text.trim()} onClick={enviar}>
          Enviar
        </Button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Puede mirar la cola, escribir publicaciones, programarlas y planificar la semana.{" "}
        <strong>No aprueba ni publica</strong>: eso lo decides tú.
      </p>
    </div>
  );
}
