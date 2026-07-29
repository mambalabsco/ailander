/**
 * Variables de entorno de Supabase.
 *
 * Se leen en un único sitio para que el fallo, cuando falta una, sea un mensaje
 * claro y no un `undefined` que viaja hasta dentro de la librería y revienta
 * con "Invalid URL".
 *
 * Las dos primeras son públicas por diseño: llegan al navegador y no son un
 * secreto — la publishable key solo permite lo que permitan las políticas RLS.
 * `SUPABASE_SECRET_KEY` es lo contrario: **nunca** puede importarse desde un
 * componente cliente, y por eso vive en su propio módulo con la marca
 * `server-only`.
 */

export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL. Cópiala de .env.example a .env.local con el valor de tu proyecto.",
    );
  }
  return value;
}

export function supabasePublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Cópiala de .env.example a .env.local con el valor de tu proyecto.",
    );
  }
  return value;
}

/**
 * ¿Está Supabase configurado?
 *
 * Sirve para que la aplicación pueda arrancar y compilar sin credenciales —en
 * el build de CI, por ejemplo— en lugar de fallar al importar.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
