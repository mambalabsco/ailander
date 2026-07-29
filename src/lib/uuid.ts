/**
 * ¿Tiene esto forma de identificador de Postgres?
 *
 * `products.id` y compañía son `uuid`. Cuando llega otra cosa —un slug de un
 * producto creado antes de migrar a Supabase, o un enlace viejo— Postgres **no
 * devuelve vacío: falla la consulta**, y el usuario veía «invalid input syntax
 * for type uuid» en mitad de la pantalla.
 *
 * Un identificador que no puede existir en esa columna es un «no encontrado»,
 * no un error, y esta comprobación es lo que permite tratarlo así.
 *
 * Vive en su propio módulo, sin dependencias, para poder probarlo suelto: la
 * capa de datos arrastra `next/navigation` y no se puede importar fuera del
 * servidor.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(id: string): boolean {
  return UUID.test(id.trim());
}
