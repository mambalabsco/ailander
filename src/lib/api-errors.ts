/**
 * Traduce los errores de la API de Anthropic a algo accionable.
 *
 * **Existe por una tarde perdida.** Una tanda de investigación terminó con
 * «No se pudieron extraer los datos del informe» en dos de tres documentos. Ese
 * mensaje apunta al código: invita a revisar el esquema, el prompt, el parser.
 * La causa real era que se había acabado el saldo de la API.
 *
 * Un error que manda a depurar cuando lo que hay que hacer es recargar la
 * cuenta es un error mal puesto. El texto de la causa ya venía dentro de la
 * respuesta; solo faltaba mirarlo.
 *
 * Es una función pura y sin dependencias para poder probarla y usarla desde
 * cualquier sitio.
 */

export type ApiFailureKind =
  | "saldo"
  | "credenciales"
  | "limite"
  | "sobrecarga"
  | "peticion"
  | "desconocido";

export interface ApiFailure {
  kind: ApiFailureKind;
  /** Qué pasa y qué hacer, en una frase. Se enseña tal cual. */
  message: string;
  /** Si reintentar lo mismo puede funcionar sin que cambies nada. */
  retryable: boolean;
}

export function describeApiError(error: unknown): ApiFailure {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.toLowerCase();

  // El orden importa: «credit balance is too low» también contiene «credit»,
  // así que lo más específico va primero.
  if (text.includes("credit balance") || text.includes("purchase credits")) {
    return {
      kind: "saldo",
      message:
        "Se acabó el saldo de la API de Anthropic. Recarga en console.anthropic.com → Plans & Billing y reintenta: lo ya generado no se pierde.",
      retryable: true,
    };
  }

  if (text.includes("authentication") || text.includes("invalid x-api-key") || text.includes("401")) {
    return {
      kind: "credenciales",
      message:
        "La clave de Anthropic no es válida. Revísala en Configuración: puede estar caducada o mal copiada.",
      retryable: false,
    };
  }

  if (text.includes("rate limit") || text.includes("429")) {
    return {
      kind: "limite",
      message: "Se alcanzó el límite de peticiones por minuto. Espera un momento y reintenta.",
      retryable: true,
    };
  }

  if (text.includes("overloaded") || text.includes("529") || text.includes("503")) {
    return {
      kind: "sobrecarga",
      message: "La API de Anthropic está saturada ahora mismo. Reintenta en unos minutos.",
      retryable: true,
    };
  }

  if (text.includes("invalid_request_error") || text.includes("400")) {
    return {
      kind: "peticion",
      // Se conserva el texto original: aquí la causa concreta sí es útil.
      message: `La API rechazó la petición: ${raw.slice(0, 300)}`,
      retryable: false,
    };
  }

  return { kind: "desconocido", message: raw || "Error desconocido.", retryable: true };
}
