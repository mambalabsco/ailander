import "server-only";

import { requireContext } from "@/lib/supabase/session";
import { nextPosition, type Ordered } from "@/lib/studio-order";

/**
 * El estudio: proyectos y las piezas que se van ordenando dentro.
 *
 * El orden vive en `studio-order.ts`, que es puro y está probado. Aquí solo se
 * lee y se escribe.
 */

export type AssetKind = "imagen" | "clip" | "voz" | "musica" | "video";

export interface StudioAsset {
  id: string;
  projectId: string;
  kind: AssetKind;
  url: string;
  name: string;
  model: string;
  prompt: string;
  seconds: number;
  position: number;
  included: boolean;
  createdAt: string;
}

export interface StudioProject {
  id: string;
  name: string;
  productId: string;
  notes: string;
  updatedAt: string;
}

export async function listProjects(): Promise<StudioProject[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("studio_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los proyectos: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    productId: row.product_id,
    notes: row.notes,
    updatedAt: row.updated_at,
  }));
}

export async function createProject(name: string, productId: string): Promise<string> {
  const { supabase, userId } = await requireContext();

  const { data, error } = await supabase
    .from("studio_projects")
    .insert({ user_id: userId, name: name || "Sin título", product_id: productId })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear el proyecto: ${error.message}`);

  return data.id;
}

export async function deleteProject(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("studio_projects").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

export async function listAssets(projectId: string): Promise<StudioAsset[]> {
  const { supabase } = await requireContext();

  const { data, error } = await supabase
    .from("studio_assets")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw new Error(`No se pudieron leer las piezas: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as AssetKind,
    url: row.url,
    name: row.name,
    model: row.model,
    prompt: row.prompt,
    // `numeric` llega como texto desde PostgREST.
    seconds: Number(row.seconds),
    position: row.position,
    included: row.included,
    createdAt: row.created_at,
  }));
}

export async function addAsset(input: {
  projectId: string;
  kind: AssetKind;
  url: string;
  name?: string;
  model?: string;
  prompt?: string;
  seconds?: number;
}): Promise<string> {
  const { supabase, userId } = await requireContext();

  // Detrás de las que ya hay: una pieza nueva no se cuela en medio del montaje.
  const existing: Ordered[] = (await listAssets(input.projectId)).map((asset) => ({
    id: asset.id,
    position: asset.position,
  }));

  const { data, error } = await supabase
    .from("studio_assets")
    .insert({
      user_id: userId,
      project_id: input.projectId,
      kind: input.kind,
      url: input.url,
      name: input.name ?? "",
      model: input.model ?? "",
      prompt: input.prompt ?? "",
      seconds: input.seconds ?? 0,
      position: nextPosition(existing),
    })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar la pieza: ${error.message}`);

  await touchProject(input.projectId);

  return data.id;
}

export async function updateAsset(
  id: string,
  patch: { position?: number; included?: boolean; name?: string },
): Promise<void> {
  const { supabase } = await requireContext();

  const row: Partial<{ position: number; included: boolean; name: string }> = {};
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.included !== undefined) row.included = patch.included;
  if (patch.name !== undefined) row.name = patch.name;

  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from("studio_assets").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAsset(id: string): Promise<void> {
  const { supabase } = await requireContext();

  const { error } = await supabase.from("studio_assets").delete().eq("id", id);
  if (error) throw new Error(`No se pudo borrar: ${error.message}`);
}

/** Deja el proyecto arriba en la lista: es en el que se está trabajando. */
async function touchProject(projectId: string): Promise<void> {
  try {
    const { supabase } = await requireContext();
    await supabase
      .from("studio_projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);
  } catch {
    return;
  }
}
