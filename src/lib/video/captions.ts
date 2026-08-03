/**
 * Los estilos de subtítulo que se pueden elegir.
 *
 * Sin imports, probado en `captions.test.ts`.
 *
 * ## Por qué aquí ya no hay nada más
 *
 * Este archivo tenía además el texto de los subtítulos y sus tiempos: se
 * calculaban a partir de cuándo dijo cada palabra el generador de voz y se le
 * mandaban hechos al servicio, para que solo pusiera la animación.
 *
 * Salían descuadrados, y tenían que salir. Esos tiempos describen el archivo de
 * voz suelto, no el vídeo terminado. Entre uno y otro hay clips que se recortan,
 * un último plano que se estira hasta el final del audio y una mezcla con
 * música — y unas décimas de desvío se leen como que el subtítulo no va con la
 * voz.
 *
 * Ahora los transcribe el servicio del vídeo ya montado, escuchando lo que de
 * verdad suena, así que no hay ningún tiempo que calcular. Lo único que sigue
 * haciendo falta de nuestra parte es decirle cómo se escriben las palabras que
 * va a oír pronunciadas de otra forma, y eso vive en `vocabulary.ts`.
 */

export const SUBTITLE_PRESETS: { id: string; label: string; note: string }[] = [
  { id: "hustle", label: "Hustle", note: "Palabra a palabra, grande y con rebote. El de los anuncios." },
  { id: "slay", label: "Slay", note: "Resalta con color la palabra que está sonando." },
  { id: "glide", label: "Glide", note: "Entra deslizando, más suave que los de rebote." },
  { id: "fusion", label: "Fusion", note: "Lleva fondo detrás del texto: se lee sobre cualquier imagen." },
  { id: "backdrop", label: "Backdrop", note: "Caja sólida detrás. El más legible de todos." },
  { id: "vegas", label: "Vegas", note: "Muy marcado y con mucho color, para ganchos cortos." },
  { id: "simple", label: "Simple", note: "Blanco con borde y sin animación, por si molesta el movimiento." },
];
