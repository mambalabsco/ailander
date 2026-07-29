import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { describeApiError } from "@/lib/api-errors";

/**
 * Registro de errores.
 *
 * **Existe porque diagnosticar un fallo obligaba a bucear en la base de datos a
 * mano.** Cuando la tanda de investigación falló, el mensaje de la interfaz
 * decía «no se pudieron extraer los datos» y la causa real —saldo agotado—
 * estaba en un texto que nadie guardaba entero.
 *
 * Lo que se guarda va pensado para diagnosticar, no para tranquilizar: dónde
 * ocurrió en el código, la traza, y con qué datos.
 */

/** La traza completa llenaría la tabla de ruido; con la cabeza basta para situarlo. */
const STACK_LIMIT = 4000;

export async function logError(input: {
  /** Dónde, en términos del código: «research-runner extracción». */
  context: string;
  error: unknown;
  productId?: string | null;
  /** Datos para reproducirlo: modelo, documento, parámetros. */
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabase, userId } = await requireContext();
    const error = input.error;

    await supabase.from("error_log").insert({
      user_id: userId,
      product_id: input.productId ?? null,
      context: input.context,
      message: error instanceof Error ? error.message : String(error ?? "error desconocido"),
      stack: error instanceof Error ? (error.stack ?? "").slice(0, STACK_LIMIT) : null,
      kind: describeApiError(error).kind,
      detail: (input.detail ?? null) as never,
    });
  } catch {
    /*
     * Nunca lanza, y es deliberado.
     *
     * Esto se llama desde dentro de un `catch`. Si fallara y propagara, un
     * error registrable se convertiría en una excepción sin capturar y se
     * perdería también el fallo original — justo lo que se quería conservar.
     */
  }
}

export interface ErrorEntry {
  id: string;
  productId: string | null;
  context: string;
  message: string;
  stack: string | null;
  kind: string | null;
  detail: unknown;
  createdAt: string;
}

export async function listErrors(limit = 100): Promise<ErrorEntry[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("error_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudo leer el registro de errores: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    context: row.context,
    message: row.message,
    stack: row.stack,
    kind: row.kind,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
