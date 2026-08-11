import "server-only";

import { requireContext } from "@/lib/supabase/session";

/**
 * El espacio de trabajo y quién está dentro.
 *
 * Las políticas de la base de datos ya reparten los datos por espacio; esto es
 * lo que permite **verlo y cambiarlo** sin entrar a Supabase a escribir filas a
 * mano.
 */

export interface Member {
  userId: string;
  email: string;
  role: string;
  /** Excepciones sobre las de su papel. Nulo es «las de su papel». */
  capabilities: string[] | null;
  isMe: boolean;
}

export interface Space {
  id: string;
  name: string;
}

/** Los espacios a los que pertenece quien está mirando. */
export async function myWorkspaces(): Promise<Space[]> {
  const { supabase, userId } = await requireContext();

  /*
   * Dos consultas y no una anidada.
   *
   * La relación entre las dos tablas no está declarada en los tipos generados,
   * así que una consulta anidada no se puede comprobar en compilación: pasaría
   * como `unknown` y el fallo saldría en pantalla. Dos consultas cuestan un
   * viaje más y se comprueban enteras.
   */
  const { data: pertenece } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  const ids = (pertenece ?? []).map((row) => row.workspace_id);
  if (ids.length === 0) return [];

  const { data } = await supabase.from("workspaces").select("id, name").in("id", ids);

  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

/**
 * Quién está en un espacio.
 *
 * El correo sale de `profiles`. Sin él la lista serían identificadores, y nadie
 * reconoce a una persona por su uuid: se acabaría cambiando el papel del que no
 * era.
 */
export async function membersOf(workspaceId: string): Promise<Member[]> {
  const { supabase, userId } = await requireContext();

  const { data: filas } = await supabase
    .from("workspace_members")
    .select("user_id, role, capabilities")
    .eq("workspace_id", workspaceId);

  const ids = (filas ?? []).map((row) => row.user_id);
  if (ids.length === 0) return [];

  const { data: personas } = await supabase.from("profiles").select("id, email").in("id", ids);
  const correos = new Map((personas ?? []).map((row) => [row.id, row.email]));

  return (filas ?? []).map((row) => ({
    userId: row.user_id,
    // Sin correo la lista serían identificadores, y nadie reconoce a una
    // persona por su uuid: se acabaría cambiando el papel del que no era.
    email: correos.get(row.user_id) ?? row.user_id,
    role: row.role,
    capabilities: row.capabilities,
    isMe: row.user_id === userId,
  }));
}

/** Mete a alguien que ya tiene cuenta. Por correo, que es como se le conoce. */
export async function addMemberByEmail(
  workspaceId: string,
  email: string,
  role: string,
): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireContext();

  const { data: person } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  /*
   * Sin cuenta no se puede asignar, y se dice con esas palabras.
   *
   * «No se encontró» hace pensar en un error de escritura; lo que casi siempre
   * pasa es que esa persona todavía no se ha registrado, y entonces lo que hay
   * que hacer es otra cosa: decirle que entre y volver aquí.
   */
  if (!person) {
    return {
      ok: false,
      message: `Nadie con «${email}» tiene cuenta todavía. Que se registre y vuelve a asignarlo.`,
    };
  }

  const { error } = await supabase
    .from("workspace_members")
    .upsert({ workspace_id: workspaceId, user_id: person.id, role });

  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: `${email} está dentro como ${role}.` };
}

export async function setRole(workspaceId: string, memberId: string, role: string) {
  const { supabase } = await requireContext();

  await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);
}

/**
 * Las excepciones de una persona.
 *
 * `null` la devuelve a las de su papel, que es distinto de una lista vacía —eso
 * es «no toca nada»—. Poder volver atrás importa: sin ello, una excepción puesta
 * por probar se queda para siempre y nadie sabe si fue a propósito.
 */
export async function setCapabilities(
  workspaceId: string,
  memberId: string,
  capabilities: string[] | null,
) {
  const { supabase } = await requireContext();

  await supabase
    .from("workspace_members")
    .update({ capabilities })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);
}

export async function removeMember(workspaceId: string, memberId: string) {
  const { supabase } = await requireContext();

  await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);
}

/* --------------------------- Sacar de un producto --------------------------- */

export async function exclusionsOf(workspaceId: string): Promise<{ productId: string; userId: string }[]> {
  const { supabase } = await requireContext();

  const { data } = await supabase
    .from("product_exclusions")
    .select("product_id, user_id")
    .eq("workspace_id", workspaceId);

  return (data ?? []).map((row) => ({
    productId: (row as { product_id: string }).product_id,
    userId: (row as { user_id: string }).user_id,
  }));
}

/**
 * Saca a alguien de un producto, o lo devuelve.
 *
 * Se guarda lo que se quita, no lo que se concede: por defecto el equipo ve
 * todo. Así, olvidarse tiene la consecuencia benigna —se ve— y la lista queda
 * corta, que es lo que hace que alguien la revise.
 */
export async function setExclusion(input: {
  workspaceId: string;
  productId: string;
  userId: string;
  excluded: boolean;
  reason?: string;
}): Promise<void> {
  const { supabase } = await requireContext();

  if (!input.excluded) {
    await supabase
      .from("product_exclusions")
      .delete()
      .eq("workspace_id", input.workspaceId)
      .eq("product_id", input.productId)
      .eq("user_id", input.userId);

    return;
  }

  await supabase.from("product_exclusions").upsert({
    workspace_id: input.workspaceId,
    product_id: input.productId,
    user_id: input.userId,
    reason: input.reason ?? "",
  });
}

/* ---------------------------- El espacio activo ----------------------------- */

/**
 * Cuál de tus espacios estás administrando.
 *
 * Se guarda en una cookie y no en la base de datos porque es una preferencia de
 * quien mira, no un dato del equipo: dos pestañas abiertas en espacios distintos
 * es un caso legítimo, y guardarlo en el servidor lo haría imposible.
 *
 * Se comprueba siempre contra los espacios a los que perteneces. Una cookie la
 * escribe cualquiera: sin esa comprobación, cambiarla a mano sería una forma de
 * administrar un equipo ajeno.
 */
export const ACTIVE_COOKIE = "espacio";

export async function activeWorkspace(): Promise<Space | null> {
  const { cookies } = await import("next/headers");

  const spaces = await myWorkspaces();
  if (spaces.length === 0) return null;

  const elegido = (await cookies()).get(ACTIVE_COOKIE)?.value ?? "";

  return spaces.find((one) => one.id === elegido) ?? spaces[0];
}
