"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, SelectField, TextField } from "@/components/ui";
import { resumeAutopilotAction, saveAutopilotAction } from "@/app/instagram/autopilot-actions";
import { mismaHoraEnUTC } from "@/lib/instagram/autopilot";
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

/**
 * Las zonas que conoce el navegador, y si no las da, unas cuantas a mano.
 *
 * Escribir la lista aquí sería garantizar que se queda vieja: los nombres de la
 * base de datos de zonas cambian cada pocos años. `supportedValuesOf` da
 * exactamente las que `Intl` sabe interpretar, que son las mismas que va a saber
 * interpretar quien programe la publicación.
 */
const ZONAS: string[] = (() => {
  const propias = Intl.supportedValuesOf?.("timeZone") ?? [];

  return propias.length > 0
    ? propias
    : [
        "UTC",
        "America/Mexico_City",
        "America/Bogota",
        "America/Lima",
        "America/Santiago",
        "America/Argentina/Buenos_Aires",
        "America/New_York",
        "Europe/Madrid",
      ];
})();
export function AutopilotPanel({
  productId,
  estado,
  cuentas,
  sinPoderPreguntar,
  listas,
}: {
  productId: string;
  estado: Autopilot | null;
  cuentas: { id: string; username: string }[];
  /** Vacío si se pudo preguntar a Meta. Con texto, por qué no se pudo. */
  sinPoderPreguntar: string;
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
  const [zonaHoraria, setZonaHoraria] = useState(
    /*
     * Una zona guardada que este navegador ya no conozca cae a UTC.
     *
     * No es teórico: los nombres de la base de datos de zonas se retiran y se
     * renombran. Sin esto, el desplegable no tendría esa opción y
     * `toLocaleString` lanzaría al pintar — el panel entero en blanco por un
     * nombre viejo.
     */
    ZONAS.includes(estado?.zonaHoraria ?? "") ? (estado?.zonaHoraria as string) : "UTC",
  );

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

      {sinPoderPreguntar ? (
        /*
         * Esto no es «no hay ninguna»: es «no se ha podido preguntar».
         *
         * Decir lo primero cuando pasa lo segundo manda a reautorizar una
         * conexión que está bien, y esconde el selector de un piloto que ya
         * tenía su cuenta elegida. La cuenta guardada sigue puesta y se puede
         * guardar igual.
         */
        <p className="text-sm text-amber-700 dark:text-amber-500">
          No se ha podido preguntar a Meta qué cuentas pueden publicar: {sinPoderPreguntar}. No
          quiere decir que no haya ninguna.{" "}
          {igUserId ? `Sigue elegida la ${igUserId}.` : "Ninguna elegida todavía."}
        </p>
      ) : cuentas.length === 0 ? (
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
        <Field label={`Desde las (${zonaHoraria})`}>
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaDesde}
            onChange={(e) => setHoraDesde(Number(e.target.value))}
          />
        </Field>
        <Field label={`Hasta las (${zonaHoraria})`}>
          <TextField
            type="number"
            min={0}
            max={23}
            value={horaHasta}
            onChange={(e) => setHoraHasta(Number(e.target.value))}
          />
        </Field>
      </div>

      {/*
        La zona va junto a la franja y no escondida: sin ella, «de 18 a 21» era
        la hora del servidor —UTC— y quien lo configuraba desde México creía
        haber pedido la tarde cuando había pedido el mediodía.
      */}
      <Field label="Zona horaria">
        <SelectField value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)}>
          {ZONAS.map((una) => (
            <option key={una} value={una}>
              {una}
            </option>
          ))}
        </SelectField>
      </Field>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Publicará entre las {String(horaDesde).padStart(2, "0")}:00 y las{" "}
        {String(horaHasta).padStart(2, "0")}:59 de {zonaHoraria}, que hoy son de las{" "}
        {mismaHoraEnUTC(horaDesde, zonaHoraria)} a las {mismaHoraEnUTC(horaHasta, zonaHoraria)} en
        UTC.
      </p>

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
                zonaHoraria,
              }),
            )
          }
        >
          Guardar
        </Button>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {listas} lista(s) por delante
          {estado?.ultimaPublicacionAt
            ? /*
               * En la zona del producto, no en la de quien mira.
               *
               * `toLocaleString()` a secas usa el reloj del navegador en el
               * cliente y el del servidor al renderizar: además de descuadrar
               * la hidratación, contaba la última publicación en un reloj y la
               * ventana en otro, que es justo la confusión que esto arregla.
               */
              ` · última publicación ${new Date(estado.ultimaPublicacionAt).toLocaleString("es", {
                timeZone: zonaHoraria,
              })} (${zonaHoraria})`
            : " · todavía no ha publicado nada"}
        </p>
      </div>

      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}
    </div>
  );
}
