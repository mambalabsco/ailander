import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * Las cuentas de Instagram donde se puede publicar de verdad.
 *
 * ## Por qué se pregunta a Meta y no se escribe a mano
 *
 * Porque el identificador de una cuenta de Instagram no se parece a nada que
 * nadie sepa de memoria, y pegado a mano de un sitio equivocado el fallo llega
 * tarde: el contenedor se crea, se procesa y falla con un error sobre un objeto
 * que no existe.
 *
 * ## Y por qué se recorren las Páginas
 *
 * Porque la API no da «tus cuentas de Instagram»: da tus Páginas de Facebook, y
 * de cada una, la cuenta profesional vinculada si la hay. Una cuenta personal no
 * aparece por ningún lado — que es exactamente lo que hay que poder decir.
 */
export async function listPublishableAccounts(): Promise<
  { id: string; username: string }[]
> {
  const { supabase } = await requireContext();

  // Sin filtrar por usuario: las sesiones son del espacio de trabajo, y RLS ya
  // acota a las suyas. Filtrar aquí no falla — devuelve una lista vacía y el
  // panel diría que hay que reconectar aunque alguien del equipo ya lo hizo.
  const { data } = await supabase
    .from("meta_logins")
    .select("access_token, scopes, token_expires_at")
    .order("is_default", { ascending: false });

  const valido = (data ?? []).find(
    (one) =>
      (one.scopes ?? []).includes("instagram_content_publish") &&
      (!one.token_expires_at || new Date(one.token_expires_at) > new Date()),
  );

  if (!valido) return [];

  const url = new URL("https://graph.facebook.com/v26.0/me/accounts");
  url.searchParams.set("fields", "instagram_business_account{id,username}");
  url.searchParams.set("access_token", valido.access_token);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!response?.ok) return [];

  const body = (await response.json().catch(() => ({}))) as {
    data?: { instagram_business_account?: { id?: string; username?: string } }[];
  };

  return (body.data ?? [])
    .map((page) => page.instagram_business_account)
    .filter((one): one is { id: string; username?: string } => Boolean(one?.id))
    .map((one) => ({ id: one.id, username: one.username ?? one.id }));
}
