# Lo que queda

Escrito el 11 de agosto de 2026, al final de una sesión larga. Ordenado por lo
que desbloquea, no por lo que cuesta.

## 0. Desplegar

**35 commits sin aplicar.** Todo lo de estos dos días vive solo en `origin/main`.
`./actualizar.sh` en el servidor: aplica migraciones, pasa los tests —si fallan,
aborta sin tocar nada—, construye, reinicia e imprime la versión.

Hasta que eso ocurra, cualquier prueba mide código viejo. Hoy perdimos dos
vueltas por esto, así que ahora el resumen de cada copia lleva dentro la versión
con la que se hizo.

## 1. Espacio de trabajo compartido

Ver `equipo-compartido.md`. Decidido y planificado, sin empezar. Es el bloque
grande: toca las políticas de todas las tablas.

## 2. Ahorro

**«Mirar antes el panel» era el consejo correcto y la sospecha era falsa.**
Medido el 12 de agosto sobre las 122 llamadas registradas:

| qué | USD | % |
|---|---|---|
| investigación | 73,02 | 80% |
| copy | 18,17 | 20% |
| extracción | 0,09 | — |

Los tres prompts que este documento señalaba son de la ruta de copy, que es el
20%. Y dentro de la investigación, dos tercios son **tokens de entrada**: 15,4
millones contra 1,07 de salida. Eso no es un prompt gigante —un encargo son
1.500 tokens— sino el bucle de búsqueda, que reprocesa todo lo acumulado en cada
vuelta, hasta doce por documento y hasta siete peticiones por reanudación.

**Hecho:**

- **Caché en la investigación**, con el punto de corte moviéndose al último
  bloque de cada reanudación. Es lo que ataca ese 91% de entrada acumulada;
  cachear solo el encargo habría ahorrado un dígito porcentual.
- **Caché en los ganchos**: hasta doce tandas seguidas con el mismo contexto
  delante, que antes se pagaba entero doce veces.
- **La contabilidad, que era lo que faltaba para poder verlo.** El motor de
  caché existía desde el 11 de agosto y nueve llamadas ya lo usaban, pero
  `cacheReadTokens` no llegaba al registro desde ningún sitio: se devolvía y se
  tiraba. La caché podía estar ahorrando y el panel habría enseñado lo mismo.

**Cómo se comprueba, y no vale darlo por bueno sin esto:** `cache_read_tokens`
en el panel de Gasto tiene que dejar de ser 0. Si sigue en 0, algo variable se
cuela delante del bloque marcado y la caché no sirve — y no da ningún error.

- **Ocho búsquedas y esfuerzo medio**, decididos el 12 de agosto. Están como
  `MAX_BUSQUEDAS` y `ESFUERZO` en `research-runner.ts`, con nombre y no
  escondidos en la llamada, porque lo que compran es **menos evidencia por
  informe**: es un cambio de calidad. Si los informes salen peor, se suben y se
  acabó.

**Lo que queda:**

- **Volver a medir `estimateResearchCost`.** El «suele costar» de los botones
  sigue diciendo entre 80.000 y 260.000 tokens de entrada, que era verdad con
  doce búsquedas y sin caché. Ahora sobreestima, que es el lado bueno del error
  pero es un número falso. Se corrige con los datos de la primera tanda.
- **Modelo más barato donde no decide nada.** La extracción es el candidato
  obvio y no se puede sin más: `effort` **da error en Haiku 4.5** y
  `extractStructured` lo manda. Está escrito en `provider-config.ts`. Y lo que
  hay en juego son 0,09 dólares.
- **Añadir caché a las llamadas de una sola vez sería perder dinero**: escribir
  la caché cuesta un 25% más y sin una segunda lectura no se recupera. Solo
  compensa donde hay tanda.

## 3. El logo de sculptchile

Tapado con un parche en `theme.liquid`, **sin causa encontrada**.

`applySettings` **queda descartado**, auditado el 11 de agosto. Cuando `current`
es un objeto —que es el caso de esa tienda: su `settings_data.json` traía el
`logo` y el `favicon` con valor— lee ese mismo objeto, cambia solo las claves del
plan y lo devuelve entero. No puede perder el logo por ahí.

Sí hace una cosa que conviene saber, aunque no sea esto: si `current` fuera el
**nombre de un preestablecido**, lo convierte en un objeto. Es lo que hace el
propio editor de Shopify al tocar el primer ajuste y el preestablecido original
sigue en `presets`, pero desengancha el tema de él para siempre. También pierde
la cabecera de comentario que escribe Shopify, que es cosmético.

Así que el logo hay que buscarlo **fuera de la plataforma**. Lo que se sabe: el
`<h1>` del tema cae por la rama `{% else %}`, o sea que `settings.logo` llega
vacío al renderizar; el favicon —misma imagen, mismo archivo— sí sale; y quitar
el favicon del ajuste sí lo hace desaparecer, o sea que el tema publicado lee
esos ajustes y los cambios surten efecto. Siguiente paso razonable: comparar el
historial de versiones de `config/settings_data.json` en el editor de código de
Shopify, que guarda las versiones anteriores.

## 4. Cabos de las portadas

- Generar las imágenes de una portada clonada de golpe. Hoy quedan como huecos
  con su encargo, a propósito: generar antes de leer los textos es gastar a
  ciegas. Si se añade, que sea un botón aparte y que diga cuánto cuesta.
- Adaptar los colores de una copia a la marca de destino. La tienda no guarda
  paleta: habría que sacarla del tema, que es el archivo del punto 3.

## 5. Sin confirmar en producción

Nada de esto se ha visto funcionar en el servidor:

- El montaje con la música mezclada por ffmpeg y la duración mandada por las
  tomas. **Ojo**: si la voz es más larga que los planos, ahora se corta.
- La copia de parches-tinicalm con los cinco arreglos de hoy.
- El generador de páginas de producto en sus dos modos.
- El texto de anuncio de los vídeos y las franjas de gancho.

## 6. Administración de usuarios

Pedido: editar los datos de una persona, cambiarle la contraseña, el correo o la
recuperación, y **dar accesos a partes de la plataforma con independencia de su
papel**.

**Los accesos independientes del papel ya están hechos.** `capabilitiesFor` los
resuelve —nulo es «las de su papel», una lista los sustituye, y lo que no está en
el catálogo se descarta— y se marcan en `/equipo`, botón «Accesos», con vuelta
atrás. Y ya se aplican de verdad: `requireCapability` y el menú
resuelven contra la pertenencia, no contra el papel a secas.

**La otra mitad también, desde el 12 de agosto de 2026.** En `/admin`, por
persona: mandarle el enlace de recuperación, proponerle un correo nuevo, y
fijarle la contraseña a mano detrás de su aviso. Diseño y plan en
`docs/superpowers/specs/2026-08-12-administracion-cuentas-design.md`.

Lo que hay que saber de cómo quedó:

- **El correo lo confirma la persona, no el admin.** Comprobado contra la API:
  `updateUserById({ email })` lo cambia al instante y se salta el doble
  confirmado de `config.toml`. Así que el admin *propone* y quien llama a
  `updateUser` es ella desde su sesión, que es lo que hace que Supabase mande
  sus dos correos. Se ve al entrar, en `/cuenta`.
- **La clave de servicio se usa en una sola llamada de todo esto**: fijar la
  contraseña, en `src/lib/data/people-admin.ts`. El enlace de recuperación va
  por `resetPasswordForEmail`, que es el camino que ya existía.
- **Cada acción comprueba dos cosas**: `canManageAccount` —el papel alcanza— y
  `mando_sobre` —esa persona está en alguno de sus espacios—. La segunda es una
  función `security definer`, la misma que usan las políticas.
- Y de paso, `profiles` y `audit_log` dejaron de ser globales: ver
  `equipo-compartido.md`.

**Lo que sigue sin poderse hacer, y por qué:**

- **Cerrar las sesiones de otra persona.** `admin.signOut` pide el JWT de esa
  persona, que no tenemos. No hay forma con esta API.
- **Borrar una cuenta.** Comprobado el 12 de agosto contra el proyecto real:
  falla siempre con `workspaces_created_by_fkey`, porque al registrarse se le
  crea un espacio y esa clave foránea no tiene cascada. Y el error llega a
  supabase-js como `{}`, sin mensaje: quien lo intente verá «no se pudo» sin
  tener por dónde empezar. Arreglarlo es decidir antes qué pasa con el espacio
  de quien se va —se borra con lo que hay dentro, o se traspasa—, y eso es de
  negocio, no de migración.

## 7. Suelto

- Los botones que no parecen botones en copias publicadas. Necesita la URL.
- Conversión de moneda del gasto publicitario al panel. Necesita una decisión:
  tipo de cambio en vivo o fijado por periodo, y si el histórico se reconvierte o
  se congela. Es de negocio, no técnica.
- El gráfico de división de gastos que no se llena. Sin diagnosticar.
