"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, SelectField, TextField } from "@/components/ui";
import { resumeAutopilotAction, saveAutopilotAction } from "@/app/instagram/autopilot-actions";
import type { Autopilot } from "@/lib/data/autopilot";

/**
 * El panel del autopiloto.
 *
 * ## Por qué se enseña el motivo de la pausa y no solo «parado»
 *
 * Porque un piloto pausado y uno que va bien pero no tiene nada que publicar se
 * ven exactamente igual desde fuera: la cuenta está callada. Sin el motivo, la
 * única forma de distinguirlos es entrar al servidor a leer el registro.
 */
export function AutopilotPanel({
  productId,
  estado,
  cuentas,
  listas,
}: {
  productId: string;
  estado: Autopilot | null;
  cuentas: { id: string; username: string }[];
  /** Cuántas hay listas por delante. Es lo que dice si el colchón se sostiene. */
  listas: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const [activo, setActivo] = useState(estado?.activo ?? false);
  const [igUserId, setIgUserId] = useState(estado?.igUserId ?? "");
  const [porDia, setPorDia] = useState(estado?.porDia ?? 1);
  const [colchonDias, setColchonDias] = useState(estado?.colchonDias ?? 3);
  const [horaDesde, setHoraDesde] = useState(estado?.horaDesde ?? 18);
  const [horaHasta, setHoraHasta] = useState(estado?.horaHasta ?? 21);

  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await fn();
      setNote(result.message);
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      {estado?.pausadoPor ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">Está parado.</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{estado.pausadoPor}</p>
          <Button
            className="mt-2"
            disabled={pending}
            onClick={() => correr(() => resumeAutopilotAction({ productId }))}
          >
            Reanudar
          </Button>
        </div>
      ) : null}

      {cuentas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ninguna conexión de Meta puede publicar todavía: la que hay nació solo con permiso de
          lectura de anuncios.{" "}
          <Link href="/datos/conexiones" className="underline">
            Reautoriza con permiso de publicación
          </Link>{" "}
          para poder encender esto.
        </p>
      ) : (
        <Field label="Cuenta de Instagram">
          <SelectField value={igUserId} onChange={(e) => setIgUserId(e.target.value)}>
            <option value="">Elige una</option>
            {cuentas.map((one) => (
              <option key={one.id} value={one.id}>
                @{one.username}
              </option>
            ))}
          </SelectField>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Al día">
          <TextField
            type="number"
            min={1}
            max={5}
            value={porDia}
            onChange={(e) => setPorDia(Number(e.target.value))}
          />
        </Field>
        <Field label="Colchón (días)">
          <TextField
            type="number"
            min={1}
            max={14}
            value={colchonDias}
            onChange={(e) => setColchonDias(Number(e.target.value))}
          />
        </Field>
        <Field label="Desde las">
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaDesde}
            onChange={(e) => setHoraDesde(Number(e.target.value))}
          />
        </Field>
        <Field label="Hasta las">
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaHasta}
            onChange={(e) => setHoraHasta(Number(e.target.value))}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
        <span>
          <span className="font-medium">Publicar solo.</span>{" "}
          <span className="text-slate-500 dark:text-slate-400">
            Escribe, genera la imagen, programa y publica sin que nadie lo lea. Los reels quedan
            esperando vídeo, que todavía no se genera solo.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            correr(() =>
              saveAutopilotAction({
                productId,
                activo,
                igUserId,
                porDia,
                colchonDias,
                horaDesde,
                horaHasta,
              }),
            )
          }
        >
          Guardar
        </Button>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {listas} lista(s) por delante
          {estado?.ultimaPublicacionAt
            ? ` · última publicación ${new Date(estado.ultimaPublicacionAt).toLocaleString()}`
            : " · todavía no ha publicado nada"}
        </p>
      </div>

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}
