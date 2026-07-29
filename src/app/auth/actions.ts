"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Registro, entrada y salida.
 *
 * Los mensajes de error se devuelven traducidos y **sin distinguir si el fallo
 * fue el correo o la contraseña**: decir "ese correo no existe" convierte el
 * formulario en un comprobador de qué cuentas hay dadas de alta.
 */

interface AuthResult {
  error?: string;
}

/**
 * El origen público de la aplicación, sacado de la propia petición.
 *
 * **No se lee de `NEXT_PUBLIC_SITE_URL`, y es a propósito.** Las variables con
 * ese prefijo las incrusta Next **al compilar**: si el build corrió antes de
 * fijar el dominio, queda `localhost` grabado dentro y los correos de
 * recuperación llevan ahí para siempre, aunque la variable ya esté bien. Pasó
 * exactamente eso.
 *
 * La cabecera la pone el servidor que atiende cada petición, así que acierta sin
 * depender de cuándo se compiló ni de qué había en el entorno entonces.
 */
async function siteOrigin(): Promise<string> {
  const incoming = await headers();

  // Detrás de Caddy y Cloudflare, el esquema real viaja en `x-forwarded-proto`:
  // la conexión que ve Next es HTTP plano aunque el visitante vaya por HTTPS.
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const proto = incoming.get("x-forwarded-proto") ?? "https";

  if (host) return `${proto}://${host}`;

  // Sin cabeceras no queda más que la variable, que es mejor que nada.
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

function validate(email: string, password: string): string | null {
  if (!email || !email.includes("@")) return "Escribe un correo válido.";
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  return null;
}

export async function signIn(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const { email, password } = readCredentials(formData);
  const invalid = validate(email, password);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "No hemos podido entrar con esos datos. Revísalos e inténtalo otra vez." };
  }

  const next = String(formData.get("next") ?? "/");
  // Solo rutas internas: un `next` con dominio propio convertiría el formulario
  // en un redirector abierto hacia páginas de phishing.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  revalidatePath("/", "layout");
  redirect(target);
}

export async function signUp(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const { email, password } = readCredentials(formData);
  const invalid = validate(email, password);
  if (invalid) return { error: invalid };

  const displayName = String(formData.get("displayName") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    return { error: "No se pudo crear la cuenta. Puede que ese correo ya esté registrado." };
  }

  // Con confirmación de correo activada la sesión aún no existe: la pantalla de
  // login explica que hay que confirmar antes de entrar.
  redirect("/auth/login?registrado=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}

/* ---------------------------- Recuperar la contraseña ---------------------------- */

/**
 * Manda el correo con el enlace para poner una contraseña nueva.
 *
 * **Responde lo mismo exista o no la cuenta.** Decir «ese correo no está
 * registrado» convertiría el formulario en un comprobador de qué cuentas hay
 * dadas de alta, que es justo lo que se evita en el resto del archivo.
 */
export async function requestPasswordReset(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult & { sent?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Escribe un correo válido." };

  const supabase = await createClient();

  /*
   * El enlace vuelve a `/auth/callback` con `next` apuntando al formulario de
   * cambio: es el mismo camino que usa la confirmación de registro, así que
   * basta con que esa URL esté en la lista blanca de Supabase.
   */
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/auth/nueva-clave`,
  });

  return { sent: true };
}

/**
 * Guarda la contraseña nueva.
 *
 * Solo funciona con la sesión temporal que abre el enlace del correo. Sin ella
 * Supabase rechaza el cambio, que es lo que impide que alguien cambie la clave
 * de otro entrando por esta ruta.
 */
export async function updatePassword(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== repeat) return { error: "Las dos contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        "No se pudo cambiar la contraseña. El enlace del correo caduca en una hora: pide otro.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
