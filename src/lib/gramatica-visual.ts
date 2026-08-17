/**
 * Cómo se ve una creatividad, y no solo qué lleva dentro.
 *
 * **Existe porque los prompts no eran cortos: eran planos.** El encargo generaba
 * mil caracteres bien escritos que describían *muebles colocados* —«cuatro cajas
 * iguales en fila», «tres tarjetas en rejilla»—, y eso es una diapositiva. Las
 * creatividades que de verdad funcionan tienen otra cosa: **un dispositivo de
 * confrontación** —un rayo que parte el lienzo, una cara dividida por la mitad,
 * una cadena con un eslabón roto— y una jerarquía tipográfica que no admite
 * lectura tibia.
 *
 * Y un síntoma medido, que era el más visible: tres anuncios seguidos del mismo
 * producto pidieron «fondo verde oscuro», «fondo claro» y «degradado a verde
 * menta». Tres marcas distintas. De ahí la regla de la paleta.
 *
 * Puro y sin imports de valor, para poder cargarlo desde `node --test`.
 */

/**
 * Las reglas que mandan sobre la instrucción visual de cada formato.
 *
 * Van **una sola vez** en el encargo y no repetidas dentro de cada formato:
 * repetirlas diez veces gasta contexto y mueve el punto de corte de la caché de
 * prefijo, que es lo que hace que una tanda no se pague entera diez veces.
 */
export function reglasVisuales(opciones: { total: number }): string {
  return `## Cómo se ve una creatividad de esta marca

Estas siete reglas mandan sobre la instrucción visual de cada formato. Si una
instrucción y una regla se contradicen, **gana la regla**.

1. **Un dispositivo, siempre.** Cada imagen se organiza alrededor de UNA tensión
   visual: un rayo que parte el lienzo en dos, una cara dividida por la mitad,
   una cadena con un eslabón roto, dos paneles enfrentados, una lista tachada.
   **Nada de rejillas neutras** de tarjetas o cajas repartidas por igual: eso es
   una diapositiva, no un anuncio.

2. **Tres alturas de texto, y solo tres.** Un antetítulo de dos a cuatro
   palabras; debajo **una sola palabra** en mayúsculas que ocupe **un cuarto del
   alto del lienzo**; debajo un subtitular de una línea en el color de acento.
   Escribe esa medida dentro del prompt —«occupying one quarter of the canvas
   height»—, nunca «large» a secas: «grande» es relativo y sale grandecito.

3. **Tres viñetas. Nunca cinco.** Con casilla marcada, de cuatro a seis palabras
   cada una.

4. **Una sola paleta en los ${opciones.total}.** El primer anuncio fija fondo,
   color de acento y color de texto, y los demás los repiten **con las mismas
   palabras**. El rojo se reserva para el lado equivocado —el mito, lo que falló,
   el eslabón roto— y no se usa para nada más.

5. **La misma barra inferior en los ${opciones.total}**, con la forma
   \`Marca · Oferta · Garantía\`, escrita igual en todos.

6. **Nada de letra pequeña.** Lo que no se lea en una miniatura no entra: pedir
   «fine print» produce manchas grises ilegibles.

7. **El envase abajo y centrado**, descrito con las mismas palabras en todos.`;
}

/**
 * La instrucción visual de cada formato.
 *
 * Vive aquí y no en `short-ad-prompts.ts` para poder probar que ningún formato
 * se queda sin ella: aquel importa con alias y no se puede cargar desde un test.
 */
export const INSTRUCCIONES_VISUALES: Record<string, string> = {
  /* ----------------------------- Casino online ------------------------------ */

  "ganador-nominal": `Foto real de entrega de premio: una persona común —45 a 65 años, nada de modelos— sosteniendo un cheque gigante o una placa, con **confeti en el aire** y el salón del casino detrás, desenfocado. Cara de sorpresa contenida, no de euforia. Icono de la app arriba a la izquierda. Arriba a la derecha, una **burbuja de borde irregular** morada muy oscura con la marca en blanco fino y debajo el reclamo en magenta pesado. Banda inferior morada con el titular en **condensada muy pesada** y **el nombre y el monto resaltados sobre un rectángulo verde lima**. Badge de la tienda abajo al centro. El dispositivo es el resalte: cae sobre la cifra, nunca sobre el verbo.`,

  "testimonio-cambio-vida": `La misma foto de entrega con confeti, pero el titular no nombra a nadie: va en primera persona y **la segunda mitad va resaltada sobre magenta**, con puntos suspensivos al final. La banda inferior ocupa un tercio de la pieza. Fajos de billetes locales compuestos en el borde de abajo, entrando en la foto. El dispositivo es la frase partida en dos colores: la primera mitad afirma y la segunda invita.`,

  "bono-de-bienvenida": `Foto de ganador con confeti al fondo, pero **el protagonista es la cifra**: banda inferior con «TE REGALAMOS» en blanco y el **monto gigante resaltado sobre verde lima**, ocupando más que ninguna otra cosa de la pieza. Icono de la app arriba a la izquierda y badge de la tienda abajo. Billetes locales en el borde inferior. El dispositivo es el tamaño: la cifra dobla a todo lo demás.`,

  "ahora-online": `Foto de sala de casino real con gente celebrando. Arriba a la derecha, la burbuja irregular con el nombre del casino en blanco y **«¡AHORA ONLINE!» en magenta pesado**, que es el mensaje entero. Abajo, banda con la oferta de entrada y el badge de la tienda. El dispositivo es el contraste entre la sala física reconocible y la palabra «online».`,

  "app-en-mano-casino": `**Un teléfono sostenido en primer plano con la app de la imagen de referencia en pantalla, reproducida tal cual.** La mano ocupa el tercio inferior y el teléfono está ligeramente inclinado, con reflejo real de pantalla. Detrás, desenfocada, la sala del casino con luces y confeti. Icono de la app arriba a la izquierda y banda inferior corta con el reclamo. El dispositivo es la profundidad: la pantalla nítida y el mundo detrás borroso, que es lo que dice «esto se juega desde aquí».`,

  "comprobante-de-retiro": `Primer plano de un teléfono con **la notificación del banco en pantalla** —el aviso de transferencia recibida, con el monto—, y detrás, desenfocada, la app abierta en otro dispositivo o la persona en su cocina. La prueba la da **la interfaz del banco, no la del casino**: ese es el dispositivo entero. Banda inferior corta con las horas que tardó. Nada de confeti aquí: esto no celebra, demuestra.`,

  "donde-ya-pagas": `Fondo limpio del color de marca. En el centro, **los logotipos de los métodos de pago locales** en fila, grandes y reconocibles, como los que aparecen en la tienda de la esquina. Encima, una línea corta: depositar con lo que ya usas. El teléfono con la app pequeño a un lado. El dispositivo es la familiaridad: no hay nada nuevo que aprender, y por eso no hay nada que temer.`,

  "cuanto-es-eso": `Composición en **dos mitades**: arriba la cifra del premio, gigante; abajo, esa misma cifra traducida a cosas de la vida en tres iconos con su número —meses de arriendo, sueldos, años de colegio—. El dispositivo es la conversión: un número grande no se siente, una cuenta sí. Tipografía condensada, fondo oscuro de marca, nada de fotos de lujo.`,

  "sueldo-de-por-vida": `Un **calendario o una libreta de banco** con la misma cantidad repitiéndose mes tras mes, en filas, hasta salirse del encuadre. Una persona común mirándolo con calma, no con euforia. El dispositivo es la repetición: lo que se vende no es un golpe de suerte, es que no se acabe. Banda inferior sobria.`,

  "la-mesa-en-vivo": `**Una crupier real mirando a cámara** desde dentro de la pantalla de un teléfono sostenido en primer plano, con la mesa y las cartas alrededor. Iluminación cálida de sala. El dispositivo es la mirada: alguien te está mirando de vuelta, y eso rompe la idea de estar solo frente a una máquina. Sin texto incrustado.`,

  "antes-de-dormir": `Luz de lámpara, de noche. Alguien en el sillón o en la cama, en pijama, con el teléfono y **la cara iluminada por la pantalla**. La casa a oscuras alrededor. Sin confeti, sin dinero, sin nadie más. El dispositivo es la hora: dice cuándo se juega de verdad y da permiso sin pedirlo.`,

  "reaccion-de-los-otros": `El ganador está **de espaldas o desenfocado**, y quien ocupa el foco es su familia mirándolo: la cara de la hija, la de la señora, las manos en la boca. El dispositivo es el reflejo: la emoción se cuenta por lo que le pasa a los demás, que es más creíble que la del propio protagonista. Banda inferior con la frase corta.`,

  "sala-o-sillon": `**Dos columnas separadas por una línea fina.** A la izquierda, el viaje al casino: el auto, la carretera, la fila de entrada, en gris apagado. A la derecha, el sillón de casa con el teléfono, a todo color. Dos o tres palabras bajo cada columna. El dispositivo es la comparación de esfuerzo, y por eso el lado izquierdo tiene que verse cansado.`,

  "app-en-mano-calle": `**Teléfono en la mano con la app de la imagen de referencia en pantalla, reproducida tal cual**, sostenido por alguien del público en un sitio cotidiano del país: un colectivo, una cocina, la vereda. Luz natural, foto de móvil sin producción, ligeramente descentrada. Sin sala de casino ni confeti. El dispositivo es lo mundano: parece una foto que alguien mandó, no una campaña.`,

  "cuaderno-manuscrito": `Cuaderno de espiral sobre mesa de madera, luz cálida. En la hoja, **una sola frase manuscrita enorme** ocupando media página y subrayada a marcador; el resto de la nota, mucho más pequeño y a boli. El producto apoyado encima. El dispositivo es el salto de tamaño entre esa frase y todo lo demás: nada de párrafos parejos.`,

  "beneficios-flotantes": `Persona real del público sosteniendo el producto, **iluminada** contra un fondo del color de marca que se apaga hacia los bordes. Solo **tres** etiquetas flotantes en píldora, grandes y legibles. Encima, el antetítulo pequeño y la palabra gigante. El dispositivo es la luz: ella brilla y el fondo no.`,

  "urgencia-countdown": `Un reloj enorme ocupando un tercio del lienzo, con la aguja en rojo, enfrentado al producto al otro lado. Entre los dos, el plazo como palabra gigante. Nada de escena de temporada con muchos elementos: el reloj contra el producto y ya.`,

  "comparativa-precio": `Tres gastos cotidianos **tachados**, en gris y pequeños a un lado, contra el producto al otro ocupando el doble de espacio. Entre ambos, el coste diario del producto como titular a un cuarto del alto. Tres viñetas debajo. Nada más.`,

  "testimonios-grid": `**Un solo** testimonio grande —foto circular, cinco estrellas y la cita como titular a un cuarto del alto— con dos más pequeños debajo a modo de refuerzo. El dispositivo es la jerarquía: uno manda y dos acompañan. Nada de tres tarjetas iguales en fila.`,

  "antes-despues": `Dos encuadres de la misma persona separados por una **línea diagonal marcada**, no por un borde fino: el izquierdo desaturado y apagado, el derecho con color y luz. Un rótulo corto sobre cada lado. La diferencia se ve y sigue siendo creíble.`,

  "ugc-selfie": `Foto de móvil sin producción: alguien del público sosteniendo el producto en su casa, luz de ventana, encuadre descentrado e imperfecto. **Es el único formato sin texto incrustado y sin dispositivo**: su fuerza es parecer una foto enviada a una amiga, así que las reglas 1, 2 y 3 no se le aplican. Las demás sí.`,

  "mecanismo-explicado": `Tres pasos encadenados de izquierda a derecha con flechas, y el **tercero roto y en rojo**, marcado con una equis. El producto debajo, con una flecha gruesa señalando justo ese paso. Arriba, el titular de negación.`,

  "packshot-oferta": `El producto centrado y grande sobre fondo liso del color de marca, con el precio como **la palabra gigante** —un cuarto del alto— y el precio anterior tachado al lado, mucho más pequeño. Tres sellos en píldora debajo. Mucho aire alrededor.`,

  "pregunta-directa": `Fondo liso y saturado con una sola pregunta ocupando casi todo el lienzo, **la última palabra en el color de acento** y el resto en blanco. El producto pequeño abajo, centrado. La pregunta es la creatividad.`,

  "rayo-de-negacion": `A la izquierda, la silueta de una persona apagada, en gris y hundida. A la derecha, la misma silueta **iluminada** con el color de acento, de pie y con los brazos arriba. Entre las dos, **un rayo que parte el lienzo de arriba abajo**. Sobre la izquierda, una insignia roja redondeada con el mito y una equis; sobre la derecha, una verde con la causa real y un check. En el centro, el antetítulo pequeño y debajo la palabra gigante con lo que se niega, y bajo ella el subtitular en el color de acento con la causa real. Tres viñetas. Envase abajo centrado.`,

  "comparativa-dividida": `El primer plano de una persona **partido justo por la mitad**: la mitad izquierda con color y sonriendo, la derecha en gris y agotada. Sobre cada mitad, un rótulo en píldora: a la izquierda cómo se vive cuando funciona, a la derecha «la tuya». A cada lado, cinco filas cortas en píldora, con check verde a la izquierda y equis roja a la derecha. El producto centrado sobre la línea de corte. Arriba, el titular de negación en dos líneas, la segunda con la parte clave en el color de acento.`,

  "lo-que-probaste": `Dos columnas. A la izquierda, bajo el rótulo «lo que probaste», siete u ocho soluciones **tachadas con una línea**, en gris. A la derecha, bajo «por qué no funcionó», una frase corta en el color de acento y debajo la explicación en dos líneas. Entre las columnas, un rayo vertical. Abajo, cruzando el ancho, la palabra gigante con lo que de verdad falló. Envase abajo centrado.`,

  "cadena-rota": `Una cadena de cinco eslabones redondeados en fila, unidos por flechas. Los dos primeros en verde con check; **el tercero en rojo, roto y con una equis**; los dos últimos apagados en gris. Dentro del roto, en mayúsculas, lo que le falta. Desde el producto, abajo, una flecha gruesa del color de acento apuntando justo a ese eslabón. Arriba, el titular. Fondo claro para que la cadena se lea.`,

  "dos-vias": `Dos paneles verticales enfrentados con borde redondeado: el izquierdo con borde rojo y el rótulo del camino de siempre, el derecho con borde del color de acento y el del camino del producto. Dentro de cada uno, cinco pasos en vertical unidos por flechas hacia abajo, con equis roja a la izquierda y check verde a la derecha, y un dibujo sencillo encima de cada columna. El producto entre los dos paneles. Abajo, dos líneas grandes con la conclusión.`,
};
