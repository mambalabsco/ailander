/**
 * Países, idiomas y monedas, para elegir en vez de escribir.
 *
 * Sin imports, probado en `locales.test.ts`.
 *
 * ## Por qué existe
 *
 * Los cuatro campos del mercado —país, código, idioma, moneda— eran texto libre,
 * y el resultado se veía en pantalla: **Chile con moneda EUR**. Nada avisaba,
 * porque cualquier cadena de tres letras es una moneda válida para un campo de
 * texto.
 *
 * El daño no es cosmético. La moneda del mercado rotula los precios de los
 * productos, decide cómo se comparan con los de la competencia y entra en los
 * informes. Un mercado chileno en euros hace que un producto de 24.900 pesos
 * aparezca como «24.900 €».
 *
 * La lista cubre los mercados hispanohablantes completos y los grandes del
 * resto. No pretende ser el mundo entero: un desplegable de doscientos países
 * es peor que uno de cuarenta con buscador, y los que faltan se pueden escribir.
 */

export interface Country {
  /** ISO 3166-1 alfa-2. */
  code: string;
  name: string;
  /** ISO 4217. */
  currency: string;
  /** El idioma que se habla, para rellenarlo también. */
  language: string;
}

/**
 * Ordenados por relevancia para este proyecto y después alfabéticamente.
 *
 * Los cinco primeros son los mercados en los que se vende; poner Chile y México
 * arriba ahorra escribir en el 90% de los casos.
 */
export const COUNTRIES: Country[] = [
  { code: "CL", name: "Chile", currency: "CLP", language: "es" },
  { code: "MX", name: "México", currency: "MXN", language: "es" },
  { code: "ES", name: "España", currency: "EUR", language: "es" },
  { code: "US", name: "Estados Unidos", currency: "USD", language: "en" },
  { code: "CO", name: "Colombia", currency: "COP", language: "es" },

  { code: "AR", name: "Argentina", currency: "ARS", language: "es" },
  { code: "BO", name: "Bolivia", currency: "BOB", language: "es" },
  { code: "BR", name: "Brasil", currency: "BRL", language: "pt" },
  { code: "CA", name: "Canadá", currency: "CAD", language: "en" },
  { code: "CR", name: "Costa Rica", currency: "CRC", language: "es" },
  { code: "CU", name: "Cuba", currency: "CUP", language: "es" },
  { code: "DO", name: "República Dominicana", currency: "DOP", language: "es" },
  { code: "EC", name: "Ecuador", currency: "USD", language: "es" },
  { code: "SV", name: "El Salvador", currency: "USD", language: "es" },
  { code: "GT", name: "Guatemala", currency: "GTQ", language: "es" },
  { code: "HN", name: "Honduras", currency: "HNL", language: "es" },
  { code: "NI", name: "Nicaragua", currency: "NIO", language: "es" },
  { code: "PA", name: "Panamá", currency: "PAB", language: "es" },
  { code: "PY", name: "Paraguay", currency: "PYG", language: "es" },
  { code: "PE", name: "Perú", currency: "PEN", language: "es" },
  { code: "PR", name: "Puerto Rico", currency: "USD", language: "es" },
  { code: "UY", name: "Uruguay", currency: "UYU", language: "es" },
  { code: "VE", name: "Venezuela", currency: "VES", language: "es" },

  { code: "DE", name: "Alemania", currency: "EUR", language: "de" },
  { code: "AU", name: "Australia", currency: "AUD", language: "en" },
  { code: "AT", name: "Austria", currency: "EUR", language: "de" },
  { code: "BE", name: "Bélgica", currency: "EUR", language: "nl" },
  { code: "DK", name: "Dinamarca", currency: "DKK", language: "da" },
  { code: "FR", name: "Francia", currency: "EUR", language: "fr" },
  { code: "GR", name: "Grecia", currency: "EUR", language: "el" },
  { code: "IE", name: "Irlanda", currency: "EUR", language: "en" },
  { code: "IT", name: "Italia", currency: "EUR", language: "it" },
  { code: "JP", name: "Japón", currency: "JPY", language: "ja" },
  { code: "NO", name: "Noruega", currency: "NOK", language: "no" },
  { code: "NL", name: "Países Bajos", currency: "EUR", language: "nl" },
  { code: "PL", name: "Polonia", currency: "PLN", language: "pl" },
  { code: "PT", name: "Portugal", currency: "EUR", language: "pt" },
  { code: "GB", name: "Reino Unido", currency: "GBP", language: "en" },
  { code: "CZ", name: "Chequia", currency: "CZK", language: "cs" },
  { code: "RO", name: "Rumanía", currency: "RON", language: "ro" },
  { code: "SE", name: "Suecia", currency: "SEK", language: "sv" },
  { code: "CH", name: "Suiza", currency: "CHF", language: "de" },
  { code: "TR", name: "Turquía", currency: "TRY", language: "tr" },
];

export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: Language[] = [
  { code: "es", name: "Español" },
  { code: "en", name: "Inglés" },
  { code: "pt", name: "Portugués" },
  { code: "fr", name: "Francés" },
  { code: "de", name: "Alemán" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Neerlandés" },
  { code: "pl", name: "Polaco" },
  { code: "sv", name: "Sueco" },
  { code: "da", name: "Danés" },
  { code: "no", name: "Noruego" },
  { code: "cs", name: "Checo" },
  { code: "ro", name: "Rumano" },
  { code: "el", name: "Griego" },
  { code: "tr", name: "Turco" },
  { code: "ja", name: "Japonés" },
];

export interface Currency {
  code: string;
  name: string;
}

/**
 * Las monedas que aparecen en la lista de países, más las que se usan sin ser
 * de ningún país de arriba.
 */
export const CURRENCIES: Currency[] = [
  { code: "CLP", name: "Peso chileno" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "Dólar estadounidense" },
  { code: "COP", name: "Peso colombiano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "BOB", name: "Boliviano" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "CRC", name: "Colón costarricense" },
  { code: "CUP", name: "Peso cubano" },
  { code: "DOP", name: "Peso dominicano" },
  { code: "GTQ", name: "Quetzal" },
  { code: "HNL", name: "Lempira" },
  { code: "NIO", name: "Córdoba" },
  { code: "PAB", name: "Balboa" },
  { code: "PYG", name: "Guaraní" },
  { code: "PEN", name: "Sol peruano" },
  { code: "UYU", name: "Peso uruguayo" },
  { code: "VES", name: "Bolívar" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "CHF", name: "Franco suizo" },
  { code: "DKK", name: "Corona danesa" },
  { code: "NOK", name: "Corona noruega" },
  { code: "SEK", name: "Corona sueca" },
  { code: "PLN", name: "Zloty" },
  { code: "CZK", name: "Corona checa" },
  { code: "RON", name: "Leu rumano" },
  { code: "JPY", name: "Yen" },
  { code: "TRY", name: "Lira turca" },
];

/* -------------------------------- Búsqueda --------------------------------- */

/**
 * Quita acentos y mayúsculas para poder buscar «mexico» y encontrar «México».
 *
 * Sin esto, escribir sin acentos —que es lo que hace todo el mundo al buscar
 * rápido— no encuentra ni España ni México ni Perú, que son justo los mercados
 * de este proyecto.
 */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Escrito con escapes: el rango de diacríticos como caracteres literales
    // es invisible en un diff y se pierde en cualquier reformateo.
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filtra una lista por lo que se escribe.
 *
 * Busca en el nombre **y en el código**: quien sabe que Chile es `CL` escribe
 * `cl` y espera encontrarlo. Los que empiezan por lo escrito salen primero —
 * buscando `co`, Colombia tiene que salir antes que Costa Rica y que México.
 */
export function search<T extends { code: string; name: string }>(
  items: T[],
  query: string,
): T[] {
  const needle = fold(query);
  if (!needle) return items;

  const matches = items.filter(
    (item) => fold(item.name).includes(needle) || fold(item.code).includes(needle),
  );

  return matches.sort((a, b) => {
    const aStarts = fold(a.name).startsWith(needle) || fold(a.code).startsWith(needle);
    const bStarts = fold(b.name).startsWith(needle) || fold(b.code).startsWith(needle);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return 0;
  });
}

/** El país por su nombre o su código, para rellenar el resto. */
export function findCountry(value: string): Country | undefined {
  const needle = fold(value);
  return COUNTRIES.find((item) => fold(item.name) === needle || fold(item.code) === needle);
}

/**
 * El idioma por su nombre o su código.
 *
 * Existe porque el formulario de mercados recoge el **nombre** —«Español»— y la
 * base de datos guarda el código, con un `check` que exige entre dos y cinco
 * caracteres. Sin esta traducción el código llegaba vacío y Postgres rechazaba
 * la fila: añadir un mercado fallaba siempre, y en producción sin decir por qué.
 */
export function findLanguage(value: string): Language | undefined {
  const needle = fold(value);
  if (!needle) return undefined;
  return LANGUAGES.find((item) => fold(item.name) === needle || fold(item.code) === needle);
}

export function languageName(code: string): string {
  return LANGUAGES.find((item) => item.code === code)?.name ?? code;
}

export function currencyName(code: string): string {
  return CURRENCIES.find((item) => item.code === code)?.name ?? code;
}

/**
 * Si la moneda encaja con el país.
 *
 * Sirve para avisar sin bloquear: hay tiendas que venden en México y liquidan en
 * dólares a propósito —la de este proyecto es una— así que la combinación rara
 * no siempre es un error. Lo que no puede pasar es que nadie la mire, que es lo
 * que llevó a un mercado chileno con euros.
 */
export function currencyMatchesCountry(countryValue: string, currency: string): boolean {
  const country = findCountry(countryValue);
  if (!country || !currency) return true;
  return country.currency === currency.toUpperCase();
}
