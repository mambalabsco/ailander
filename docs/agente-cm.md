# El agente de contenido: qué falta y qué ya está

Escrito el 12 de agosto de 2026, sobre la lista pedida.

**La mitad de esto ya existe en la plataforma con otro nombre.** Antes de
construir nada conviene mirar aquí, o se harán dos veces.

## Ya está, y solo hay que conectarlo

| Lo pedido | Dónde vive ya |
|---|---|
| Memes: imagen con texto grande encima | La **franja de gancho** (`ad-hook.ts`): texto, resaltados y colores calculados por contraste |
| Karaoke subtitles | El montaje ya quema subtítulos **palabra a palabra** con sus tiempos (`words.ts`, `captions.ts`) |
| Reels desde IA | El pipeline de vídeo entero: guion, tomas, keyframes, animación, voz, música |
| Cortes al ritmo de la música | Hay ffmpeg local y la biblioteca de música; falta detectar el golpe |
| Brand character lock | La tabla `avatars` y el generador de avatares con producto |
| Photos + AI portraits | El adaptador de imágenes y el generador de retratos de comentarios |
| Niche RAG | Los **seis documentos de investigación** son eso, ya escritos y por producto |
| Trend miner | El **analizador de anuncios** y la biblioteca de referencias |
| Voice fingerprint | `languageToUse` / `languageToAvoid` del documento maestro |
| Muchos modelos | El CLI de Higgsfield, con su catálogo |

Conectar lo que ya hay cuesta una fracción de escribirlo, y además sale
coherente con el resto de la plataforma en vez de ser una isla.

## Lo que sí es nuevo, por orden de lo que rinde

1. **Chat con el agente.** Es lo que pediste y lo que cambia el uso: en vez de
   botones, decirle «esta semana vamos a insistir en el sueño» y que lo aplique.
   Necesita que el agente tenga herramientas —crear pieza, mover fecha, leer lo
   publicado— en vez de una sola llamada que devuelve texto.
2. **Que aprenda.** Hoy recuerda lo que publicó. Aprender es otra cosa: mirar
   **qué funcionó** y pesar lo siguiente con eso. Sin métricas de vuelta esto no
   existe, así que lo primero es leer alcance y guardados de lo publicado.
3. **Carruseles** con varias diapositivas y varias maquetas. Es formato nuevo:
   hoy la cola guarda una media por pieza, no una secuencia.
4. **Rotación de encuadre y emulación de película.** Barato y de los que más se
   notan: son reglas en el prompt de imagen más un pase de grano y viñeta.
5. **Banco de arquetipos de gancho.** No es código, es un activo escrito. Vale
   lo que valga la lista; copiada de cualquier sitio no vale nada.
6. **Fuentes de tendencia** (Reddit, HN, efemérides, festivos). Baratas y
   sueltas: cada una es un lector que devuelve semillas de tema.

## Lo que desaconsejo, y por qué

- **Router de varios proveedores.** Suena a robustez y trae dos problemas: cada
  modelo escribe distinto —la voz de la marca dejaría de ser una— y multiplica
  los sitios donde falla algo. Aquí ya hay caída ordenada cuando un proveedor no
  responde. Si es por precio, el panel de Gasto dice dónde está el dinero, que es
  mejor guía que cambiar de proveedor a ciegas.
- **Raspar cuentas de la competencia.** Va contra las condiciones de Instagram y
  puede costar la cuenta desde la que se publica — la misma que se quiere
  alimentar. Las tendencias sí, pero de fuentes que lo permiten.
- **Critic con rúbrica de ocho dimensiones.** Una nota de ocho ejes sobre un
  texto es una nota inventada con muchos decimales. Sirve más un criterio duro y
  pocos: ¿el gancho cabe antes del corte? ¿dice algo concreto? ¿se parece a las
  últimas quince? Eso se puede comprobar; «save potential» no.

## Lo que hay que decidir

- **Qué mide el aprendizaje.** Sin datos de alcance y guardados no hay nada que
  aprender. ¿Se leen de Instagram —permiso `instagram_manage_insights`— o se
  anota a mano lo que funcionó?
- **Una cara fija o varias.** El personaje de marca es una decisión de marca:
  una cara para siempre da reconocimiento y ata la cuenta a un rostro generado.
