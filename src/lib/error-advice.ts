/**
 * Traducir un error de pantalla a algo que se pueda hacer.
 *
 * Sin imports, probado en `error-advice.test.ts`.
 *
 * ## Por qué existe
 *
 * La pantalla de error decía «Algo ha fallado» y repetía el mensaje crudo. En
 * producción Next ni siquiera deja pasar ese mensaje: enseña un texto genérico
 * con un `digest`. El resultado real, vivido: para saber que faltaban unas
 * migraciones hubo que entrar por SSH, encontrar el servicio, filtrar
 * `journalctl` y leer la traza.
 *
 * Casi todos los fallos de esta plataforma son media docena de situaciones
 * conocidas, y cada una tiene un arreglo de una línea. Reconocerlas por su texto
 * convierte una sesión de depuración en un cartel que dice qué comando ejecutar.
 *
 * **Reconocer, no adivinar.** Cuando no se identifica el patrón se dice
 * exactamente eso y se enseña el mensaje tal cual, en vez de ofrecer un consejo
 * plausible que mande a mirar donde no es. Un diagnóstico equivocado cuesta más
 * tiempo que ninguno.
 */

export interface ErrorAdvice {
  title: string;
  explanation: string;
  /** El comando que lo arregla, si lo hay. */
  command?: string;
  /** Dónde tocarlo, si es en la interfaz. */
  where?: string;
}

interface Pattern {
  matches: RegExp;
  advice: (message: string) => ErrorAdvice;
}

const PATTERNS: Pattern[] = [
  {
    /*
     * El error de hoy. PostgREST dice «schema cache» porque no encuentra la
     * tabla en su caché, lo que suena a problema de caché y no lo es: la tabla
     * no existe porque falta aplicar una migración.
     */
    matches: /Could not find the table|schema cache|relation .* does not exist/i,
    advice: (message) => {
      const table = /'public\.([a-z_]+)'/.exec(message)?.[1];
      return {
        title: "Falta aplicar las migraciones de la base de datos",
        explanation: table
          ? `La tabla «${table}» no existe todavía. El código está actualizado pero la base de datos no, así que esta pantalla consulta algo que aún no se ha creado.`
          : "El código está actualizado pero la base de datos no: falta crear tablas o columnas nuevas.",
        command: "cd /home/plataforma/plataforma-ia && sudo -u plataforma npm run db:push",
      };
    },
  },
  {
    matches: /column .* does not exist|Could not find the '.*' column/i,
    advice: () => ({
      title: "A la base de datos le falta una columna",
      explanation:
        "Una migración añadió un campo que todavía no está aplicado. Es el mismo caso que una tabla que falta.",
      command: "cd /home/plataforma/plataforma-ia && sudo -u plataforma npm run db:push",
    }),
  },
  {
    matches: /JWT|not authenticated|Auth session missing|invalid claim/i,
    advice: () => ({
      title: "La sesión caducó",
      explanation: "Vuelve a entrar y se arregla. No se ha perdido nada de lo que estuvieras haciendo.",
      where: "Entrar de nuevo",
    }),
  },
  {
    matches: /No hay clave de API|clave de API configurada|api key/i,
    advice: () => ({
      title: "Falta la clave de API",
      explanation: "Las generaciones necesitan una clave de Anthropic configurada.",
      where: "Configuración → Claves",
    }),
  },
  {
    matches: /saldo|credit balance|insufficient/i,
    advice: () => ({
      title: "Se acabó el saldo de la API",
      explanation:
        "La generación no llegó a empezar, así que no se cobró nada. Recarga en el panel de Anthropic y vuelve a lanzarla.",
    }),
  },
  {
    matches: /Meta rechazó|caducó o se revocó|ads_read/i,
    advice: () => ({
      title: "El permiso de Meta ya no sirve",
      explanation:
        "Caducó o se revocó. Mientras tanto el gasto publicitario cuenta cero, así que el beneficio que veas será más alto del real.",
      where: "Datos y beneficio → Conexiones",
    }),
  },
  {
    matches: /Shopify rechazó el token|no tiene token de Shopify|\.myshopify\.com/i,
    advice: () => ({
      title: "La tienda no está bien conectada a Shopify",
      explanation:
        "Recuerda que la Admin API solo responde en el dominio `.myshopify.com`, no en el propio de la tienda.",
      where: "Tiendas y mercados",
    }),
  },
  {
    /*
     * Este mensaje viene de Postgres y no dice dónde está el problema.
     *
     * «new row violates row-level security policy» nombra la política de
     * escritura, pero la causa suele ser otra —una de lectura que falta, una
     * migración sin aplicar— y quien lo lee se pone a mirar los permisos de
     * escritura, que están bien.
     */
    matches: /row-level security policy/i,
    advice: () => ({
      title: "La base de datos rechazó la escritura por permisos",
      explanation:
        "Casi siempre es una migración sin aplicar: las políticas de una tabla o de un bucket se crean ahí. Aplícalas y vuelve a intentarlo; si sigue, dime en qué acción salió.",
      command: "cd /home/plataforma/plataforma-ia && sudo ./actualizar.sh",
    }),
  },
  {
    matches: /Supabase|todavía no está configurado/i,
    advice: () => ({
      title: "Falta configurar Supabase",
      explanation:
        "La plataforma guarda todo ahí y no encuentra sus credenciales en el entorno del servidor.",
      command: "sudo -u plataforma nano /home/plataforma/plataforma-ia/.env.local",
    }),
  },
];

/**
 * El consejo para un mensaje de error, o `null` si no se reconoce.
 *
 * Devuelve `null` a propósito en vez de un consejo genérico: quien llama enseña
 * entonces el mensaje crudo, que es más honesto que una pista inventada.
 */
export function adviseOn(message: string): ErrorAdvice | null {
  if (!message) return null;

  for (const pattern of PATTERNS) {
    if (pattern.matches.test(message)) return pattern.advice(message);
  }

  return null;
}
