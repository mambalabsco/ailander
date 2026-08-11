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

Hechas las dos piezas de medir: el panel de Gasto y el «suele costar» en los
botones caros. Faltan las palancas:

- **Caché de prompts.** No es un ajuste: hoy cada petición manda un único bloque
  con el contexto y los datos pegados. Cachear exige separar el trozo estable del
  variable en `buildTextPrompt`, `buildTemplateCopyPrompt` y `buildClonePrompt`,
  que son los tres que hacen tandas. Mirar antes el panel: quizá no son esos.
- **Modelo más barato donde no decide nada** —leer una imagen, escribir ganchos,
  adaptar textos ya escritos—. Nunca donde se decide estructura o se escribe el
  copy largo: ahí un ahorro de céntimos cuesta ventas.

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

## 6. Suelto

- Los botones que no parecen botones en copias publicadas. Necesita la URL.
- Conversión de moneda del gasto publicitario al panel. Necesita una decisión:
  tipo de cambio en vivo o fijado por periodo, y si el histórico se reconvierte o
  se congela. Es de negocio, no técnica.
- El gráfico de división de gastos que no se llena. Sin diagnosticar.
