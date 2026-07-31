import { stripLeadingComments } from "./theme-structure.ts";

/**
 * La configuración de un tema: colores, tipografías y esquinas.
 *
 * Probado en `theme-settings.test.ts`. El único import es el que quita la
 * cabecera autogenerada de los ficheros del tema, que ya estaba resuelto para
 * las plantillas y sería un error volver a resolver aquí a medias.
 *
 * ## Qué fichero es este
 *
 * `config/settings_data.json` es donde vive lo que se ve en «Configuración del
 * tema»: la paleta, las fuentes, el radio de los botones. Cambiar ahí un color
 * lo cambia en toda la tienda de golpe, que es justo lo que se busca al adaptar
 * un tema al aspecto de otro.
 *
 * ## Las dos formas del fichero
 *
 * `current` puede ser **un objeto** con los ajustes, o **el nombre de un ajuste
 * preestablecido**, en cuyo caso los valores de verdad están en `presets`. La
 * segunda forma es la que tiene un tema recién instalado que nadie ha tocado —o
 * sea, exactamente el caso de quien va a adaptarlo. Escribir asumiendo la
 * primera dejaría el tema con la configuración por defecto y ningún cambio
 * visible, sin dar ningún error.
 *
 * ## Los esquemas de color
 *
 * Un tema moderno no tiene «un fondo»: tiene varios esquemas y cada sección
 * elige el suyo. Aquí solo se toca el primero, que es el que usa casi todo.
 * Pisarlos todos igualaría el claro con el oscuro y dejaría la tienda plana,
 * que es lo contrario de parecerse a nada.
 */

/* ------------------------------ Leer el fichero ---------------------------- */

export interface CurrentSettings {
  /** Los ajustes en uso, ya resueltos venga como venga el fichero. */
  values: Record<string, unknown>;
  /** El nombre del preestablecido, si el tema estaba usando uno. */
  presetName: string | null;
}

export function readSettings(json: string): CurrentSettings | null {
  let data: unknown;
  try {
    data = JSON.parse(stripLeadingComments(json));
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const current = record.current;

  if (typeof current === "string") {
    const presets = record.presets;
    const preset =
      typeof presets === "object" && presets !== null
        ? (presets as Record<string, unknown>)[current]
        : null;

    if (typeof preset !== "object" || preset === null) return null;
    return { values: preset as Record<string, unknown>, presetName: current };
  }

  if (typeof current === "object" && current !== null) {
    return { values: current as Record<string, unknown>, presetName: null };
  }

  return null;
}

/* -------------------------------- El plan ---------------------------------- */

export interface SettingsChange {
  /** Dónde vive el ajuste: `color_schemes.scheme-1.settings.background`. */
  path: string;
  /** Cómo se llama, en cristiano. */
  label: string;
  from: string;
  to: string;
}

function get(values: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, values);
}

/** El primer esquema de color del tema: el que usa casi todas las secciones. */
export function primaryScheme(values: Record<string, unknown>): string | null {
  const schemes = values.color_schemes;
  if (typeof schemes !== "object" || schemes === null) return null;

  const [first] = Object.keys(schemes as Record<string, unknown>);
  return first ?? null;
}

/**
 * De qué papel leído sale qué ajuste del tema.
 *
 * El fondo y el texto son los que cambian la cara de la tienda; el botón es el
 * que se mira al decidir comprar. El borde se deja fuera a propósito: heredarlo
 * de otra tienda suele dejar líneas que no pegan con la retícula del tema propio.
 */
const ROLE_TO_SETTING: Record<string, { key: string; label: string }[]> = {
  fondo: [{ key: "background", label: "Fondo" }],
  texto: [{ key: "text", label: "Texto" }],
  botón: [
    { key: "button", label: "Botón" },
    { key: "solid_button_label", label: "Texto del botón" },
  ],
};

/**
 * Qué colores cambiar para acercarse a la identidad leída.
 *
 * Solo se propone cambiar un ajuste **que ya existe** en el tema. Inventar una
 * clave nueva en `settings_data.json` no hace nada —el tema solo lee las que
 * declara su esquema— y dejaría un plan que dice haber cambiado cosas que no
 * cambió.
 *
 * El texto del botón no se copia: se calcula el que se lee sobre el fondo del
 * botón elegido. Heredar el suyo con un botón distinto da texto blanco sobre
 * amarillo.
 */
export function planColorChanges(
  values: Record<string, unknown>,
  colors: { hex: string; role: string }[],
): SettingsChange[] {
  const scheme = primaryScheme(values);
  if (!scheme) return [];

  const base = `color_schemes.${scheme}.settings`;
  const changes: SettingsChange[] = [];

  for (const [role, targets] of Object.entries(ROLE_TO_SETTING)) {
    const color = colors.find((item) => item.role === role);
    if (!color) continue;

    for (const target of targets) {
      const path = `${base}.${target.key}`;
      const from = get(values, path);
      if (typeof from !== "string") continue;

      const to =
        target.key === "solid_button_label" ? readableOn(colorFor(colors, "botón")) : color.hex;

      if (from.toLowerCase() !== to) {
        changes.push({ path, label: target.label, from, to });
      }
    }
  }

  return changes;
}

function colorFor(colors: { hex: string; role: string }[], role: string): string {
  return colors.find((item) => item.role === role)?.hex ?? "#000000";
}

/**
 * Blanco o negro, el que se lea sobre ese fondo.
 *
 * Es la luminancia relativa de la norma de accesibilidad, con el umbral en
 * 0.179 —el punto donde el contraste contra blanco y contra negro se igualan—.
 * Un `> 0.5` ingenuo mandaría texto negro sobre un rojo de marca donde el blanco
 * se lee mejor.
 */
export function readableOn(background: string): string {
  const hex = background.replace("#", "");
  if (hex.length !== 6) return "#ffffff";

  const channels = [0, 2, 4].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

/**
 * Qué tipografías cambiar.
 *
 * Solo las que Shopify sirve, y por eso el identificador tiene que venir leído
 * de la página de origen y no deducido del nombre: el campo de fuente de un tema
 * valida contra su catálogo, y un identificador inventado deja el tema sin
 * fuente hasta que alguien entre a arreglarlo a mano.
 */
export function planFontChanges(
  values: Record<string, unknown>,
  fonts: { family: string; handle: string | null }[],
): SettingsChange[] {
  const usable = fonts.filter((font) => font.handle);
  if (usable.length === 0) return [];

  /*
   * Con dos fuentes, la primera es la de los títulos. Es el orden en que las
   * carga un tema —titulares primero, que son lo que se ve antes— y con una sola
   * se usa para las dos cosas, que es lo que hace la propia tienda de origen.
   */
  const headings = usable[0].handle!;
  const body = (usable[1] ?? usable[0]).handle!;

  const targets: { key: string; label: string; to: string }[] = [
    { key: "type_header_font", label: "Fuente de títulos", to: headings },
    { key: "type_body_font", label: "Fuente de texto", to: body },
  ];

  return targets.flatMap((target) => {
    const from = get(values, target.key);
    if (typeof from !== "string" || from === target.to) return [];

    return [{ path: target.key, label: target.label, from, to: target.to }];
  });
}

/* ------------------------------- Escribirlo -------------------------------- */

/**
 * Aplica los cambios y devuelve el fichero nuevo.
 *
 * Si el tema venía con un preestablecido, se materializa en `current`: es lo que
 * hace el propio editor de Shopify al tocar el primer ajuste, y sin eso los
 * cambios se escribirían en un sitio que el tema no lee.
 *
 * Devuelve `null` si el fichero no se puede leer. No se escribe a medias.
 */
export function applySettings(json: string, changes: SettingsChange[]): string | null {
  const read = readSettings(json);
  if (!read) return null;

  let root: Record<string, unknown>;
  try {
    root = JSON.parse(stripLeadingComments(json)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const next = structuredClone(read.values);

  for (const change of changes) {
    const keys = change.path.split(".");
    const last = keys.pop()!;

    let node: Record<string, unknown> | null = next;
    for (const key of keys) {
      const child: unknown = node?.[key];
      node = typeof child === "object" && child !== null ? (child as Record<string, unknown>) : null;
      if (!node) break;
    }

    // Un ajuste que ya no existe se salta en vez de crearlo: el tema solo lee
    // las claves que declara su esquema, así que crearla sería ruido.
    if (node && last in node) node[last] = change.to;
  }

  root.current = next;

  return `${JSON.stringify(root, null, 2)}\n`;
}
