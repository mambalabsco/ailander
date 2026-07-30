import { assignAvatars } from "@/lib/avatar-prompts";
import type {
  LandingComment,
  LandingHeader,
  LandingAuthor,
  LandingPage,
  LandingSection,
} from "@/types/landing";

/**
 * La página, convertida en HTML para pegar en Shopify.
 *
 * **Estilos en línea, no clases.** Shopify inserta esto dentro de una plantilla
 * que ya trae su propio CSS: una clase llamada `.destacado` chocaría con la del
 * tema y la página se vería distinta en cada tienda. En línea es más feo de leer
 * y es lo único que se comporta igual en todas.
 *
 * **Las imágenes quedan como huecos marcados, a propósito.** Las generadas viven
 * en un bucket privado con URL firmada que caduca en una hora: pegarlas aquí
 * daría una landing con las imágenes rotas al día siguiente. Se descargan, se
 * suben a Shopify y se sustituye el hueco.
 */

/* ------------------------------- Paleta -------------------------------------- */

const INK = "#1c1e21";
const MUTED = "#65676b";
const LINE = "#e4e6eb";
const SURFACE = "#f7f8fa";

/** Los de Facebook, para que el bloque de comentarios se reconozca al instante. */
const FB = {
  blue: "#1877F2",
  bubble: "#f0f2f5",
  meta: "#65676b",
  name: "#050505",
  line: "#ced0d4",
};

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* ------------------------------ Utilidades ------------------------------------ */

/** Escapa lo que va dentro del HTML. El texto lo escribe un modelo, no nosotros. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convierte los `**negrita**` del modelo en `<strong>`.
 *
 * Se aplica **después** de escapar: al revés, el `<strong>` que generase esta
 * función acabaría escapado y saldría escrito en la página.
 */
function inline(value: string): string {
  return escape(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Cómo se pintan las imágenes.
 *
 * `urls` empareja cada hueco con su imagen ya generada. Cuando falta, se pinta
 * un recuadro punteado en su lugar: una landing con la mitad de los huecos
 * llenos sigue siendo legible, y se ve exactamente qué queda por generar.
 */
export interface RenderOptions {
  /** Hueco → URL de la imagen ya generada. */
  urls?: Record<string, string>;
  /**
   * Si se incrustan las URLs reales.
   *
   * En la vista previa, sí: quieres ver la página terminada. En el HTML que te
   * llevas a Shopify, **no por defecto**: son URLs firmadas que caducan en una
   * hora, y la página se quedaría con las imágenes rotas al día siguiente. Ahí
   * se suben a Shopify y se sustituye el hueco.
   */
  embedUrls?: boolean;
  /**
   * Retratos para los comentarios, en orden.
   *
   * Se reparten por el nombre de quien comenta, no al azar: así cada persona
   * conserva su cara entre recargas. Con azar, la sección se delataría a la
   * primera comparación.
   */
  avatars?: string[];
}

/** Un hueco de imagen: la imagen si existe, o un recuadro que dice qué falta. */
function imageSlot(
  slot: string,
  purpose: string,
  alt: string,
  round = false,
  url?: string,
): string {
  if (url) {
    return round
      ? `<img src="${escape(url)}" alt="${escape(alt)}" width="72" height="72" style="width:72px;height:72px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block" />`
      : `<img src="${escape(url)}" alt="${escape(alt)}" style="width:100%;height:auto;border-radius:12px;margin:24px 0;display:block" />`;
  }

  return `
    <!-- IMAGEN ${escape(slot)} — sustituye este bloque por la imagen subida a Shopify.
         alt sugerido: ${escape(alt)} -->
    <div style="margin:${round ? "0" : "24px 0"};${
      round ? "width:72px;height:72px;border-radius:50%;flex-shrink:0;" : ""
    }padding:${round ? "6px" : "22px"};border:2px dashed #c7c7c7;border-radius:${
      round ? "50%" : "12px"
    };text-align:center;color:#8a8d91;font-size:${round ? "10px" : "14px"};display:flex;align-items:center;justify-content:center;flex-direction:column">
      <div style="font-weight:700">${round ? "FOTO" : "IMAGEN · "}${escape(slot)}</div>
      ${round ? "" : `<div style="margin-top:6px">${escape(purpose)}</div>`}
    </div>`;
}

/* ------------------------------- Cabecera ------------------------------------- */

function renderHeader(header: LandingHeader, urls: Record<string, string>): string {
  if (!header.enabled) return "";

  const announcement = header.announcement
    ? `<div style="background:${INK};color:#fff;text-align:center;padding:9px 14px;font-size:13px;font-weight:600;letter-spacing:.02em">${inline(header.announcement)}</div>`
    : "";

  // El logo es texto salvo que se haya generado uno: así la página funciona
  // desde el primer momento, sin esperar a una imagen.
  const logoUrl = header.logoSlot ? urls[header.logoSlot] : undefined;

  /*
   * El logo se limita por **ancho**, no por alto.
   *
   * Con `max-height` una imagen cuadrada se encoge entera, y como el logotipo
   * ocupa solo una parte del cuadro acababa midiendo unos quince píxeles. Por
   * ancho ocupa lo que le corresponde, y `object-fit:contain` evita recortarlo
   * sea cual sea la proporción que devuelva el generador.
   */
  const logo = logoUrl
    ? `<img src="${escape(logoUrl)}" alt="${escape(header.logoText)}" style="width:100%;max-width:300px;max-height:90px;object-fit:contain;display:block;margin:0 auto" />`
    : header.logoSlot
      ? `<!-- LOGO ${escape(header.logoSlot)} — sustituye por la imagen del logo -->
       <div style="border:2px dashed #c7c7c7;border-radius:8px;padding:8px 18px;color:#8a8d91;font-size:12px">LOGO · ${escape(header.logoSlot)}</div>`
      : `<div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:${INK}">${escape(header.logoText)}</div>`;

  return `${announcement}
  <header style="border-bottom:1px solid ${LINE};background:#fff">
    <div style="max-width:680px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px">
      ${logo}
      ${
        header.kicker
          ? `<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED}">${escape(header.kicker)}</div>`
          : ""
      }
    </div>
  </header>`;
}

/* -------------------------------- Autor --------------------------------------- */

/**
 * La ficha del autor.
 *
 * Antes era una línea de texto en cursiva y se veía pobre. En las páginas que
 * funcionan es una tarjeta con retrato circular, el nombre en negro y las
 * credenciales en gris: es lo que da la sensación de estar leyendo a alguien y
 * no a una marca.
 */
function renderAuthor(author: LandingAuthor, urls: Record<string, string>): string {
  const photo = author.photoSlot
    ? imageSlot(
        author.photoSlot,
        "Retrato del autor",
        `Foto de ${author.name}`,
        true,
        urls[author.photoSlot],
      )
    : `<div style="width:72px;height:72px;border-radius:50%;background:${LINE};color:${MUTED};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;flex-shrink:0">${escape(
        author.name.trim().charAt(0).toUpperCase() || "?",
      )}</div>`;

  return `
  <div style="display:flex;align-items:center;gap:16px;margin:24px 0;padding:18px;border:1px solid ${LINE};border-radius:14px;background:${SURFACE}">
    ${photo}
    <div style="min-width:0">
      <div style="font-size:19px;font-weight:700;color:${INK};line-height:1.3">${escape(author.name)}</div>
      <div style="font-size:14px;color:${MUTED};margin-top:3px;line-height:1.45">${escape(author.credentials)}</div>
      ${
        author.updatedAt
          ? `<div style="font-size:12px;color:#8a8d91;margin-top:6px">Actualizado el ${escape(author.updatedAt)}</div>`
          : ""
      }
    </div>
  </div>`;
}

/* ------------------------------ Comentarios ----------------------------------- */

/** El pulgar azul de Facebook, en SVG: no depende de cómo pinte los emojis el sistema. */
const THUMB = `<span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:${FB.blue};align-items:center;justify-content:center;vertical-align:middle">
  <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M2 10h4v12H2zM22 11.5c0-1.1-.9-2-2-2h-5.6l.9-4.1v-.4c0-.5-.2-.9-.5-1.2L13.7 2 7.6 8.1c-.4.4-.6.9-.6 1.4V20c0 1.1.9 2 2 2h8.5c.8 0 1.5-.5 1.8-1.2l2.6-6.1c.1-.2.1-.4.1-.6v-2.6z"/></svg>
</span>`;

const HEART = `<span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:#f3425f;align-items:center;justify-content:center;vertical-align:middle;margin-left:-5px">
  <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 21s-8-4.9-8-10.4C4 7.4 6.2 5 9 5c1.7 0 3 .9 3 .9S13.3 5 15 5c2.8 0 5 2.4 5 5.6C20 16.1 12 21 12 21z"/></svg>
</span>`;

function renderComment(comment: LandingComment, faces: Map<string, string>): string {
  const replies = (comment.replies ?? [])
    .map(
      (reply) => `
        <div style="display:flex;gap:8px;margin-top:8px">
          ${face(reply.name, faces, 28)}
          <div>
            <div style="background:${FB.bubble};border-radius:16px;padding:8px 12px;display:inline-block">
              <div style="font-weight:600;font-size:13px;color:${FB.name}">${escape(reply.name)}</div>
              <div style="font-size:14px;line-height:1.4;color:${FB.name}">${inline(reply.text)}</div>
            </div>
            <div style="font-size:12px;color:${FB.meta};margin-top:3px;padding-left:12px">
              <span style="font-weight:600;cursor:pointer">Me gusta</span> · <span style="font-weight:600;cursor:pointer">Responder</span> · ${escape(reply.timeAgo)}
            </div>
          </div>
        </div>`,
    )
    .join("");

  return `
      <div style="padding:10px 0">
        <div style="display:flex;gap:8px;align-items:flex-start">
          ${face(comment.name, faces, 40)}
          <div style="flex:1;min-width:0">
            <div style="background:${FB.bubble};border-radius:18px;padding:9px 13px;display:inline-block;max-width:100%">
              <div style="font-weight:600;font-size:13px;color:${FB.name};line-height:1.3">${escape(comment.name)}</div>
              <div style="font-size:15px;line-height:1.4;color:${FB.name}">${inline(comment.text)}</div>
            </div>
            <div style="font-size:12px;color:${FB.meta};margin-top:4px;padding-left:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-weight:600;cursor:pointer">Me gusta</span>
              <span>·</span>
              <span style="font-weight:600;cursor:pointer">Responder</span>
              <span>·</span>
              <span>${escape(comment.timeAgo)}</span>
              ${
                comment.likes > 0
                  ? `<span style="margin-left:auto;display:inline-flex;align-items:center;gap:3px;background:#fff;border-radius:999px;padding:1px 6px;box-shadow:0 1px 2px rgba(0,0,0,.15)">${THUMB}${
                      comment.likes > 25 ? HEART : ""
                    }<span style="color:${FB.meta};font-size:12px;margin-left:3px">${comment.likes}</span></span>`
                  : ""
              }
            </div>
            ${replies}
          </div>
        </div>
      </div>`;
}

/**
 * El avatar de una persona.
 *
 * Con retrato asignado, la foto; sin él, la inicial —igual que hace Facebook con
 * quien no tiene foto—. La misma función para comentarios y respuestas: tenerlas
 * separadas fue justo lo que dejó a las respuestas sin foto.
 */
function face(name: string, faces: Map<string, string>, size: number): string {
  const url = faces.get(name.trim());

  if (url) {
    return `<img src="${escape(url)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block" />`;
  }

  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${LINE};color:${FB.meta};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.4)}px;flex-shrink:0">${escape(
    name.trim().charAt(0).toUpperCase() || "?",
  )}</div>`;
}

function renderComments(page: LandingPage, title: string, avatars: string[]): string {
  const total = page.comments.reduce(
    (count, comment) => count + 1 + (comment.replies?.length ?? 0),
    0,
  );

  /*
   * Se imita el **aspecto** del hilo —burbujas, colores, reacciones—, no la
   * marca. No se incrusta el logotipo de Facebook: es una marca registrada de un
   * tercero, y ponerla junto a comentarios escritos para la página haría parecer
   * que Facebook avala esto. Si decides asumir ese riesgo, sustituye el bloque
   * de abajo por tu propio recurso.
   */
  /*
   * Se reparten aquí, no en cada comentario.
   *
   * El orden incluye a quien responde, en el momento en que aparece: si no, las
   * respuestas se quedaban sin cara —que es exactamente lo que pasaba— y además
   * dos personas distintas podían acabar con el mismo rostro.
   */
  const participants: string[] = [];
  for (const comment of page.comments) {
    participants.push(comment.name);
    for (const reply of comment.replies ?? []) participants.push(reply.name);
  }

  const faces = assignAvatars(participants, avatars);

  return `
  <section style="margin:40px 0 0">
    <h2 style="font-size:22px;margin:0 0 4px;font-weight:700;color:${INK}">${inline(title || "Comentarios")}</h2>
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${FB.line};padding-bottom:8px;margin-bottom:6px">
      <span style="font-size:14px;color:${FB.meta}">${total} comentarios</span>
      <span style="font-size:14px;color:${FB.meta};font-weight:600">Más relevantes ▾</span>
    </div>
    <div style="${FONT}">
      ${page.comments.map((comment) => renderComment(comment, faces)).join("")}
    </div>
  </section>`;
}

/* -------------------------------- Secciones ----------------------------------- */

function stars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return `<span style="color:#f5a623;letter-spacing:2px;font-size:17px">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function renderSection(
  section: LandingSection,
  page: LandingPage,
  urls: Record<string, string>,
  avatars: string[],
): string {
  const text = section.text ?? "";

  switch (section.kind) {
    case "titular":
      return `<h1 style="font-size:32px;line-height:1.22;margin:0 0 14px;font-weight:800;letter-spacing:-.02em;color:${INK}">${inline(text)}</h1>`;

    case "entradilla":
      return `<p style="font-size:19px;line-height:1.6;color:#3a3b3c;margin:0 0 18px">${inline(text)}</p>`;

    case "autor":
      return page.author ? renderAuthor(page.author, urls) : "";

    case "valoracion":
      return `<div style="display:flex;align-items:center;gap:9px;margin:0 0 18px;font-size:14px;color:${MUTED}">
      ${stars(section.rating ?? 5)}
      <span><strong style="color:${INK}">${(section.rating ?? 5).toFixed(1)}</strong> de 5</span>
      ${section.reviews ? `<span>· ${section.reviews.toLocaleString("es-ES")} reseñas</span>` : ""}
    </div>`;

    case "medios":
      return `<div style="margin:22px 0;padding:14px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};text-align:center">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9a9da1;margin-bottom:8px">${escape(text || "Visto en")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:18px;justify-content:center;color:#8a8d91;font-weight:800;font-size:15px;letter-spacing:.04em">
        ${(section.items ?? []).map((item) => `<span>${escape(item)}</span>`).join("")}
      </div>
    </div>`;

    case "subtitulo":
      return `<h2 style="font-size:24px;line-height:1.3;margin:34px 0 12px;font-weight:700;letter-spacing:-.01em;color:${INK}">${inline(text)}</h2>`;

    case "parrafo":
      return `<p style="font-size:17px;line-height:1.72;margin:0 0 16px;color:${INK}">${inline(text)}</p>`;

    case "lista":
      return `<ul style="font-size:17px;line-height:1.72;margin:0 0 18px;padding-left:0;list-style:none">${(
        section.items ?? []
      )
        .map(
          (item) =>
            `<li style="margin-bottom:10px;padding-left:28px;position:relative"><span style="position:absolute;left:0;color:#1a7f37;font-weight:700">✓</span>${inline(item)}</li>`,
        )
        .join("")}</ul>`;

    case "cita":
      return `<blockquote style="margin:22px 0;padding:16px 20px;border-left:4px solid ${FB.blue};background:${SURFACE};font-size:18px;line-height:1.6;font-style:italic;color:${INK}">${inline(text)}</blockquote>`;

    case "destacado":
      return `<div style="margin:22px 0;padding:18px 20px;background:#fff8e1;border:1px solid #ffe082;border-radius:12px;font-size:17px;line-height:1.65;color:#4a3b00">${inline(text)}</div>`;

    case "dato":
      return `<div style="margin:24px 0;padding:22px;background:${SURFACE};border-radius:14px;text-align:center">
      <div style="font-size:44px;font-weight:800;color:${FB.blue};line-height:1">${escape(section.value ?? "")}</div>
      <div style="font-size:16px;color:${MUTED};margin-top:8px;line-height:1.5">${inline(text)}</div>
    </div>`;

    case "mecanismo":
      return `<ol style="margin:22px 0;padding:0;list-style:none;counter-reset:paso">${(section.items ?? [])
        .map(
          (item, index) => `
        <li style="display:flex;gap:14px;margin-bottom:14px;align-items:flex-start">
          <span style="width:30px;height:30px;border-radius:50%;background:${FB.blue};color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px">${index + 1}</span>
          <span style="font-size:17px;line-height:1.6;padding-top:3px">${inline(item)}</span>
        </li>`,
        )
        .join("")}</ol>`;

    case "comparativa":
      return `<div style="display:flex;gap:12px;margin:24px 0;flex-wrap:wrap">
      <div style="flex:1;min-width:220px;border:1px solid #f0c9c9;border-radius:12px;padding:16px;background:#fdf5f5">
        <div style="font-weight:700;color:#a13d3d;margin-bottom:10px;font-size:15px">${escape(section.left?.title ?? "Sin esto")}</div>
        ${(section.left?.items ?? [])
          .map(
            (item) =>
              `<div style="font-size:15px;line-height:1.55;margin-bottom:7px;color:#5a4444">✕ ${inline(item)}</div>`,
          )
          .join("")}
      </div>
      <div style="flex:1;min-width:220px;border:1px solid #bfe3c9;border-radius:12px;padding:16px;background:#f4fbf6">
        <div style="font-weight:700;color:#1a7f37;margin-bottom:10px;font-size:15px">${escape(section.right?.title ?? "Con esto")}</div>
        ${(section.right?.items ?? [])
          .map(
            (item) =>
              `<div style="font-size:15px;line-height:1.55;margin-bottom:7px;color:#2f4a37">✓ ${inline(item)}</div>`,
          )
          .join("")}
      </div>
    </div>`;

    case "garantia":
      return `<div style="margin:26px 0;padding:20px;border:2px solid #1a7f37;border-radius:14px;background:#f4fbf6;text-align:center">
      <div style="font-size:34px;line-height:1">🛡️</div>
      <div style="font-size:18px;font-weight:700;color:#1a7f37;margin-top:6px">${escape(section.value || "Garantía")}</div>
      <div style="font-size:16px;line-height:1.6;color:#2f4a37;margin-top:6px">${inline(text)}</div>
    </div>`;

    case "oferta":
      return `<div style="margin:26px 0;display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      ${(section.items ?? [])
        .map(
          (item, index) => `
        <div style="flex:1;min-width:150px;border:${index === 1 ? `2px solid ${INK}` : `1px solid ${LINE}`};border-radius:12px;padding:16px;text-align:center;background:#fff">
          <div style="font-size:16px;line-height:1.5">${inline(item)}</div>
        </div>`,
        )
        .join("")}
    </div>`;

    case "faq":
      return `<div style="margin:26px 0">${(section.pairs ?? [])
        .map(
          (pair) => `
        <div style="border-bottom:1px solid ${LINE};padding:14px 0">
          <div style="font-size:17px;font-weight:700;color:${INK};margin-bottom:6px">${escape(pair.question)}</div>
          <div style="font-size:16px;line-height:1.65;color:#3a3b3c">${inline(pair.answer)}</div>
        </div>`,
        )
        .join("")}</div>`;

    case "separador":
      return `<hr style="border:0;border-top:1px solid ${LINE};margin:32px 0" />`;

    case "imagen": {
      const slot = page.imageSlots.find((item) => item.slot === section.slot);
      return imageSlot(
        section.slot ?? "",
        slot?.purpose ?? "",
        slot?.alt ?? "",
        false,
        urls[section.slot ?? ""],
      );
    }

    case "cta":
      return `<div style="text-align:center;margin:30px 0">
      <a href="${escape(section.href || "#")}" style="display:inline-block;background:#1a7f37;color:#fff;text-decoration:none;padding:17px 38px;border-radius:999px;font-size:19px;font-weight:700;box-shadow:0 4px 14px rgba(26,127,55,.28)">${escape(text)}</a>
    </div>`;

    case "comentarios":
      return renderComments(page, text, avatars);

    case "aviso-legal":
      return `<p style="font-size:11px;color:#9a9da1;line-height:1.6;margin:38px 0 0;text-transform:uppercase;letter-spacing:.03em">${escape(text)}</p>`;

    default:
      return `<p style="font-size:17px;line-height:1.72;margin:0 0 16px">${inline(text)}</p>`;
  }
}

/**
 * Oculta la cabecera y el pie del tema de Shopify.
 *
 * **Es CSS, no una plantilla de tema**, y conviene saber por qué. Lo limpio
 * sería un `page.advertorial.liquid` propio, pero eso obliga a editar el tema
 * desde el panel de Shopify — un paso manual por tienda que rompe la idea de
 * publicar con un clic.
 *
 * Los selectores atacan **los identificadores que genera Shopify**
 * (`shopify-section-...header`), no las clases del tema, que cambian con cada
 * plantilla. Se añaden `header` y `footer` sueltos como respaldo.
 *
 * Si en tu tema quedara algo visible, el arreglo es añadir su selector aquí, no
 * tocar el resto.
 */
/**
 * La clase de nuestro contenedor.
 *
 * Existe para poder decir «esto es mío» en el CSS. Sin una marca, ocultar el
 * título que pinta el tema significaría ocultar también el nuestro.
 */
const ROOT_CLASS = "lp-root";

const HIDE_CHROME = `<style>
  [id*="shopify-section"][id*="header"],
  [id*="shopify-section"][id*="footer"],
  [id*="shopify-section"][id*="announcement"],
  body > header, body > footer,
  .site-header, .site-footer,
  .announcement-bar, .header-wrapper, .footer-wrapper {
    display: none !important;
  }

  /*
   * El título que pinta el tema.
   *
   * **El publirreportaje salía con el titular dos veces**: el del tema, sacado
   * del nombre de la página, y el nuestro, que forma parte de la pieza. No basta
   * con quitar el nuestro: es el que lleva el tamaño, el peso y el espaciado que
   * hacen que parezca un artículo, y sin él la página empieza con la barra de
   * anuncio flotando sobre nada.
   *
   * Primero las clases que usan los temas. Después, por si el tema usa otra, un
   * barrido de cualquier h1 que no sea el nuestro: en una plantilla de página el
   * único h1 debería ser el título, y la cabecera ya está oculta.
   */
  .main-page-title, .page-title, .page__title, .page-header__title,
  .article-title, .template-page .page-width > h1, .rte + h1 {
    display: none !important;
  }
  h1:not(.${ROOT_CLASS} h1) { display: none !important; }

  /* Los temas suelen dejar hueco para la cabecera fija. */
  main, #MainContent, .main-content { padding-top: 0 !important; margin-top: 0 !important; }
</style>`;

export function renderLandingHtml(page: LandingPage, options: RenderOptions = {}): string {
  // Sin `embedUrls` no se incrusta nada aunque haya imágenes: es lo que separa
  // la vista previa del HTML que se pega en Shopify.
  const urls = options.embedUrls ? (options.urls ?? {}) : {};

  const avatars = options.embedUrls ? (options.avatars ?? []) : [];
  const body = page.sections
    .map((section) => renderSection(section, page, urls, avatars))
    .join("\n");
  const header = page.header ? renderHeader(page.header, urls) : "";

  // Solo al publicar: en la vista previa de la plataforma no hay tema que ocultar.
  const chrome = options.embedUrls && page.hideThemeChrome ? `${HIDE_CHROME}\n` : "";

  return `${chrome}<div class="${ROOT_CLASS}" style="${FONT};color:${INK};background:#fff">
${header}
<article style="max-width:680px;margin:0 auto;padding:26px 18px 48px">
${body}
</article>
</div>`;
}
