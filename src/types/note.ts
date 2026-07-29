/**
 * Notas manuales del producto.
 *
 * Son las cosas que sabe quien lleva la cuenta y no salen de ninguna
 * investigación: una restricción legal del país, una promesa que el fabricante
 * no deja hacer, lo que contó el proveedor, una objeción concreta que aparece
 * en los comentarios. Se escriben a mano y viajan dentro de los prompts.
 *
 * `includeInPrompts` permite guardar apuntes internos sin que condicionen lo
 * que escribe el modelo. Sin ese interruptor, la única forma de tener una nota
 * privada sería no escribirla.
 *
 * Este archivo es **puro a propósito**: lo importa la construcción de prompts,
 * que a su vez la importan componentes de cliente. El acceso a Supabase vive
 * aparte, en `lib/data/notes.ts`, marcado como `server-only`.
 */

export interface ProductNote {
  id: string;
  productId: string;
  title: string;
  body: string;
  includeInPrompts: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Las notas listas para meter en un prompt.
 *
 * Van al final del contexto del producto y con una instrucción explícita de que
 * mandan sobre lo demás: si una nota dice que no se puede prometer algo, esa
 * restricción tiene que ganar a lo que diga la investigación.
 */
export function describeNotes(notes: ProductNote[]): string {
  const usable = notes.filter((note) => note.includeInPrompts && note.body.trim());
  if (usable.length === 0) return "";

  return [
    "## Notas del equipo",
    "",
    "Esto lo ha escrito a mano quien lleva la cuenta y **manda sobre cualquier otra cosa de este contexto**. Si una nota contradice a la investigación, gana la nota.",
    "",
    ...usable.map((note) => (note.title ? `- **${note.title}**: ${note.body}` : `- ${note.body}`)),
  ].join("\n");
}
