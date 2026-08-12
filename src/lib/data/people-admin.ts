import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lo único de toda la administración de cuentas que necesita la clave de
 * servicio: fijarle a alguien la contraseña.
 *
 * ## Por qué este archivo tiene una sola función
 *
 * Porque aquí no hay RLS que proteja nada: quien llama es responsable de haber
 * comprobado a quién está tocando. Cuanto más corto sea, más difícil es que se
 * cuele una función nueva que se salte esa comprobación sin que se note al
 * leerlo. El resto de la administración —el enlace de recuperación y el cambio
 * de correo— no pasa por aquí a propósito: uno va por `resetPasswordForEmail` y
 * el otro lo confirma la propia persona desde su sesión.
 *
 * Quien llame tiene que haber comprobado antes `canManageAccount` **y**
 * `mandoSobre`. No se comprueba dentro porque haría falta el cliente de sesión,
 * y tener los dos clientes en el mismo archivo es justo lo que se evita.
 */
export async function setPassword(userId: string, password: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  /*
   * El mensaje se rescata a mano porque esta API no siempre lo trae.
   *
   * Comprobado el 12 de agosto de 2026: al fallar un borrado por una clave
   * foránea, el error llegó a supabase-js como `{}` —sin `message` y sin
   * `code`—. Sin este rescate, la pantalla diría «no se pudo» y no habría por
   * dónde empezar.
   */
  if (error) {
    throw new Error(
      error.message ||
        `Supabase rechazó el cambio sin decir por qué (${error.status ?? "sin código"}).`,
    );
  }
}
