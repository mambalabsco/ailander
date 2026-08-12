<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# plataforma-ia — lo que rompe el proyecto si no lo sabes

Escrito el 12 de agosto de 2026, después de romper cada una de estas cosas al
menos una vez. Si vas a tocar el código, lee esto entero: son diez minutos y
todas las líneas costaron una tarde.

## Método, antes que nada

**No propongas una causa que no hayas reproducido.** Este es el error que más
tiempo ha costado en este proyecto, con diferencia. En una sesión se ofrecieron
cuatro explicaciones seguidas para un logo que no salía y las cuatro eran
falsas; se resolvió al descargar la página publicada y leer su CSS. Ante un
fallo: pide el mensaje literal, descarga el archivo real, ejecuta la función
contra el dato real. La deducción desde el código acierta mucho menos de lo que
parece.

**Antes de diagnosticar, comprueba qué versión corre.** `./actualizar.sh`
imprime el sha al terminar, y el resumen de cada copia lo lleva dentro. Dos
veces se persiguió un fallo ya arreglado que no estaba desplegado.

## Comandos

    npx tsc --noEmit     # tipos
    npm run lint         # eslint
    npm test             # node --experimental-strip-types --test
    npm run build
    ./actualizar.sh      # despliegue: migraciones, tests, build, reinicio

**Nunca ejecutes prettier.** El proyecto no tiene configuración y reformatea a 80
columnas cuando el código está a 100: deja un diff ilegible sobre todo el árbol.

**Los tests importan con ruta relativa** —`./cosa.ts`, no `@/lib/cosa`— porque el
corredor de Node no resuelve el alias. Y solo se prueban módulos puros: lo que
importa `server-only` no se puede cargar desde un test.

## Base de datos: los datos son del **equipo**, no del usuario

Desde agosto de 2026 las políticas filtran por pertenencia a un espacio de
trabajo, no por `auth.uid()`. Consecuencias que ya han roto cosas:

- **No añadas `.eq("user_id", …)` a una consulta de lectura.** La política ya
  acota. Ese filtro estrecha a una persona lo que es del equipo y **no falla**:
  devuelve cero filas, y a quien invitas le aparece la plataforma vacía.
- **Una política sobre `workspace_members` no puede consultar
  `workspace_members`.** Es recursión y Postgres corta con «infinite recursion
  detected in policy» — y como todas las tablas preguntan por los espacios del
  usuario, tumba la aplicación entera. Usa `mis_espacios()` o `manda_en()`, que
  son `security definer`.
- **`create policy` no admite `if not exists`.** Estas migraciones se reejecutan
  en cada despliegue: pon un `drop policy if exists` delante o el segundo
  despliegue aborta y se lleva todo lo que venga detrás.
- **`workspace_id` lo rellena un disparador**, no el código. Si creas una tabla
  nueva, añádele la columna, la política y el disparador `poner_espacio`.

## Almacenamiento

Los buckets tienen su propia lista de tipos permitidos y **esa es la que manda**.
Ya ha pasado dos veces: se aceptaba un formato en el código y la subida fallaba
con «mime type X is not supported». Si amplías formatos, hay migración.

## Shopify

- `write_theme_code` va en otra sección del panel de la app y **viene
  desmarcado**. Sin él las landings se publican con el contenido dentro en vez de
  en secciones editables.
- Las plantillas de tema llevan una **cabecera de comentario** que `JSON.parse`
  rechaza. Usa `readTemplateJson`.
- Un ajuste de tipo `url` **no puede tener `default`**: rompe el editor con
  «Invalid schema».
- `themeFilesUpsert` procesa **en segundo plano**: hay que releer los archivos
  antes de dar por hecho que están.
- Un archivo de tema no puede pasar de **256 KB**, y el cuerpo de una página, de
  512 KB.

## Instagram

- **Nunca automatizar el navegador ni usar cookies de sesión.** Va contra sus
  condiciones y la cuenta que se cierra es desde la que se vende. Solo la Graph
  API oficial.
- Publicar son **dos pasos con espera**: contenedor, esperar el procesado
  preguntando, publicar.
- El cron **marca la fila antes de llamar**, no después. Sin eso, dos vueltas
  publican dos veces y eso no se deshace.

## Modelos y coste

- **No escribas a fijo el nombre de un modelo.** Ya falló: `nano-banana-pro`
  dejó de existir y tumbó una pantalla entera. Pregunta el catálogo.
- El catálogo del CLI mezcla generadores con **herramientas** (reescalar,
  restaurar): esas no aceptan prompt y fallan con «Unknown params».
- **El tipo de una imagen se lee de sus bytes**, no de la extensión ni del
  `content-type`. Declararlo mal hace fallar el lote entero.
- La **caché de prompts** exige que el prefijo sea idéntico byte a byte. Si algo
  variable se cuela delante, no falla: se paga entero. Se comprueba con
  `cache_read_tokens` en el panel de Gasto.

## Estilo

Comentarios en español, explicando **por qué** y no qué. Los que valen cuentan el
fallo que evitan. Mira los que ya hay antes de escribir los tuyos.

## Dónde está lo demás

`docs/pendiente.md` — lo que queda, ordenado.
`docs/equipo-compartido.md` — el modelo de permisos y sus decisiones.
`docs/cache-de-prompts.md` — cómo meter la caché sin que sea una creencia.
`docs/instagram.md` — los límites de la API y el estado.
`docs/agente-cm.md` — qué pide el agente y qué ya existe con otro nombre.
