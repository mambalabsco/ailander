/**
 * Los datos que una creatividad de casino necesita y la plataforma no tiene.
 *
 * Sin imports, probado en `casino-ad-brief.test.ts`.
 *
 * ## De dónde sale esto
 *
 * De analizar diez creatividades reales de Monticello, Casino Buenos Aires,
 * Lotto y CIRSA. No son diez ideas: son **una plantilla con dos familias de
 * mensaje**, y lo que las distingue son datos concretos que ningún documento de
 * investigación puede saber —cuánto regala el bono esta semana, qué premios hay
 * en la escalera, quién ganó y en qué comuna—.
 *
 * ## Por qué se piden y no se deducen
 *
 * El **bono** y la **escalera de premios** son promesas comerciales: si el modelo
 * no los tiene, se los inventa, y un bono redondeado a «$100.000» cuando eran 150
 * lucas es publicidad engañosa por descuido.
 *
 * El **nombre del ganador** es otra cosa y va al revés: si hay ganadores reales
 * se usan esos, y si no, el modelo inventa uno —así lo pidió quien usa esto—. Lo
 * que sí se le exige es que varíe entre anuncios y que la comuna exista, porque
 * el mismo nombre repetido cinco veces delata la tanda entera.
 */

export interface CasinoAdBrief {
  appName: string;
  /** Lo que se regala, escrito como va en la pieza: «$100.000 para jugar». */
  bono: string;
  /** La escalera de premios con sus equivalencias. */
  premios: string;
  /** Uno por línea: nombre, comuna, monto. Vacío si no hay ninguno real. */
  ganadores: string;
  /** Google Play, App Store, o las dos. */
  tienda: string;
  /** Cómo se llama al dinero ahí: lucas, soles, zł. */
  jerga: string;
  /** Cualquier otra cosa: fechas de sorteo, condiciones, lo que sea. */
  notas: string;
}

/**
 * La anatomía de la pieza, sacada de las diez que funcionaron.
 *
 * Va aquí y no en el encargo general porque es del **vertical**: un anuncio de
 * suplemento no lleva ni escalera de premios ni badge de tienda.
 */
const ANATOMIA = `## Cómo está construida una creatividad de casino que funciona

Sacado de diez piezas reales. La plantilla es fija y lo que cambia es el dato:

1. **La foto manda, y es real.** Una persona común —45 a 65, nada de modelos—
   sosteniendo un cheque gigante o una placa de premio, con confeti en el aire, en
   el salón del casino o en una entrega. A veces con el animador o una anfitriona.
   La cara es de sorpresa contenida, no de euforia de banco de imágenes.
2. **Arriba a la izquierda, el icono de la app** en un cuadrado redondeado.
3. **Arriba a la derecha, una burbuja orgánica** —morada muy oscura, de borde
   irregular, nunca un rectángulo— con dos líneas: la marca en blanco y fina, y
   debajo el reclamo en **magenta, pesado y en cursiva**.
4. **Banda inferior morada** ocupando el tercio de abajo, con el titular en
   **condensada muy pesada**, blanco, y **una frase resaltada sobre un rectángulo
   de color** —lima, magenta o naranja—. El resalte cae sobre el dato, no sobre
   el verbo.
5. **Abajo al centro, el badge de la tienda.**
6. **Abajo a la derecha, cuatro premios circulares** con su equivalencia en una
   píldora magenta debajo.
7. **En el borde inferior, fajos de billetes locales** compuestos sobre la foto.

Y dos familias de mensaje, no más:

- **Testimonio**: «Esto me cambió la vida y *podría ser tu historia…*». El
  resalte va en la segunda mitad y los puntos suspensivos son parte del gancho.
- **Nominal**: «[Nombre Apellido] de [comuna] *ganó [monto exacto]* en [app]
  ONLINE». Nombre, **comuna** y monto exacto. Lo hiperlocal es el motor: una
  comuna concreta convierte una promesa en una noticia.

  Si abajo hay ganadores reales, **usa esos y no otros**. Si no los hay, **puedes
  inventar el nombre y la comuna**: que suenen del país y de una comuna que
  exista, no de la capital siempre. Lo que no se inventa nunca es el **bono**, que
  es una promesa comercial y sale de los datos de abajo.

  Van entre corchetes y no con un ejemplo escrito porque un ejemplo se copia: el
  mismo nombre acabaría en las cinco piezas de la tanda.

El monto nunca va redondeado. Una cifra con sus últimos dígitos se lee como real;
«más de 40 millones» se lee como publicidad.`;

export function buildCasinoAdBrief(brief: CasinoAdBrief): string {
  const partes: string[] = [];

  if (brief.bono) partes.push(`- **Lo que se regala:** ${brief.bono}`);
  if (brief.premios) partes.push(`- **La escalera de premios:** ${brief.premios}`);
  if (brief.tienda) partes.push(`- **Dónde se descarga:** ${brief.tienda}`);
  if (brief.jerga) {
    partes.push(
      `- **Cómo se llama al dinero ahí:** ${brief.jerga}. Úsalo en el titular: es lo que hace que suene de allí y no traducido.`,
    );
  }

  const ganadores = brief.ganadores.trim();

  if (partes.length === 0 && !ganadores && !brief.notas) return "";

  const bloqueGanadores = ganadores
    ? `### Ganadores reales

${ganadores}

Úsalos **tal cual** para el formato nominal: el nombre, la comuna y el monto
exacto, sin redondear. Habiendo reales, no inventes otros: estos ya están
comprobados y los inventados solo restan.`
    : `### Sin ganadores declarados

No hay ninguno confirmado. Para el formato nominal **inventa el nombre y la
comuna**: que suenen del país y que la comuna exista y no sea siempre la capital
—lo que hace creíble la pieza es que parezca del barrio de al lado—. Varía el
nombre en cada anuncio de la tanda.

El **bono** no se inventa: sale de los datos de arriba o no se menciona.`;

  return `${ANATOMIA}

## Los datos de esta app${brief.appName ? ` (${brief.appName})` : ""}

${partes.join("\n") || "- (no se dieron)"}

${bloqueGanadores}${brief.notas ? `\n\n### Lo que además hay que saber\n\n${brief.notas}` : ""}`;
}
