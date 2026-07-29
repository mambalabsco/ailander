import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Capa de acceso a datos: quién está pidiendo.
 *
 * La comprobación de `proxy.ts` es optimista y sirve para no renderizar páginas
 * que van a fallar. **Esta es la que protege de verdad**, porque está pegada al
 * dato: cualquier lectura empieza aquí, y si no hay usuario no hay consulta.
 *
 * `getUser()` y no `getSession()`: `getSession()` devuelve lo que hay en la
 * cookie, que el cliente puede manipular. `getUser()` valida el token contra
 * Supabase, y es la única forma de fiarse del resultado en el servidor.
 *
 * Va envuelto en `cache()` de React para que varios componentes de la misma
 * página no hagan cada uno su propia llamada de validación.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

/** Igual, pero redirige a la entrada si no hay sesión. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/auth/login");
  return user;
}

/**
 * Cliente y usuario juntos, que es como se usan siempre.
 *
 * El cliente que devuelve **sí** pasa por RLS: aunque se colara un `user_id`
 * equivocado en una consulta, la base de datos no devolvería nada ajeno.
 */
export async function requireContext() {
  const [supabase, user] = await Promise.all([createClient(), requireUser()]);
  return { supabase, user, userId: user.id };
}
