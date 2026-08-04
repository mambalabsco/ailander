"use client";

import { useLinkStatus } from "next/link";

/**
 * El circulito que aparece en el enlace que se está abriendo.
 *
 * ## Por qué esto y no una pantalla de carga
 *
 * Porque la página **no se va**. Al pulsar un enlace, React mantiene lo que hay
 * en pantalla mientras el servidor prepara lo siguiente, así que lo único que
 * falta es decir que algo está pasando. Sin eso, tres segundos con la pantalla
 * quieta se leen como que el clic no funcionó, y la gente vuelve a pulsar.
 *
 * Poner en su lugar un esqueleto o una pantalla en blanco sería peor: se pierde
 * lo que se estaba mirando para enseñar cajas grises, y al llegar hay un segundo
 * salto. Se siente web; lo otro se siente aplicación.
 *
 * ## Va dentro del enlace a propósito
 *
 * `useLinkStatus` solo sabe de **su** `<Link>`, así que el circulito sale justo
 * en el sitio al que se va y no en una barra arriba que no dice a dónde. Con
 * dieciséis entradas en el menú, eso es la diferencia entre saber qué se está
 * abriendo y saber que algo se abre.
 *
 * ## Y por qué tarda en aparecer
 *
 * La animación empieza invisible y con retardo: si la navegación tarda menos que
 * eso, el circulito no llega a verse. Un parpadeo en cada clic —la mayoría son
 * instantáneos, con la ruta ya precargada— es más ruido que información.
 */
export function NavSpinner() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="nav-spinner ml-auto inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent"
    />
  );
}
