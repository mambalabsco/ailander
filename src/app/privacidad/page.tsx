import type { Metadata } from "next";

/**
 * La política de privacidad, pública y sin sesión.
 *
 * ## Por qué es una página de la plataforma y no un documento suelto
 *
 * Porque Meta la pide como **dirección**, la visita su revisor y la enseña en el
 * diálogo de inicio de sesión. Un PDF en un Drive no vale: tiene que estar en el
 * dominio del producto, responder sin sesión y seguir ahí dentro de un año.
 *
 * Va sin el armazón de la aplicación —ni menú, ni cuenta— porque quien la abre
 * casi nunca tiene sesión: es el revisor de Meta o alguien que pulsó el enlace
 * del diálogo. Un menú lateral con quince pantallas que no puede abrir solo
 * estorba.
 *
 * ## Lo que hay que revisar antes de darla por buena
 *
 * Esto cubre lo que Meta exige y describe con exactitud lo que la plataforma
 * hace hoy. No es asesoría legal: la razón social, el domicilio, la ley
 * aplicable y el correo de contacto los tiene que poner quien responde por la
 * empresa. Están todos en las constantes de abajo, en un solo sitio.
 */

/* --------------------- Lo que hay que ajustar antes de publicar ------------- */

/** Quién responde por el tratamiento. Cámbialo por la razón social real. */
const TITULAR = "Mamba Labs";

/** A dónde escribe quien quiere ejercer sus derechos o borrar sus datos. */
const CONTACTO = "clcuzmar@gmail.com";

/** La ley bajo la que se interpreta. Chile es donde opera la marca principal. */
const JURISDICCION = "Chile";

/** Cuándo se revisó por última vez. Se cambia a mano al tocar el texto. */
const ACTUALIZADA = "4 de agosto de 2026";

export const metadata: Metadata = {
  title: `Política de privacidad · ${TITULAR}`,
  description:
    "Qué datos trata la plataforma, para qué, con quién se comparten y cómo se piden su acceso o su borrado.",
};

function Seccion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidad</h1>

      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {TITULAR} · Última actualización: {ACTUALIZADA}
      </p>

      <p className="mt-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        Esta plataforma es una herramienta interna de trabajo para analizar publicidad y producir
        creatividades. No está abierta al público: se entra con una cuenta que crea {TITULAR}, y
        cada persona solo ve sus propios datos.
      </p>

      <Seccion title="Quién trata los datos">
        <p>
          {TITULAR}, responsable del tratamiento. Para cualquier asunto relacionado con esta
          política, incluido el acceso o el borrado de datos, escribe a{" "}
          <a className="underline underline-offset-2" href={`mailto:${CONTACTO}`}>
            {CONTACTO}
          </a>
          .
        </p>
      </Seccion>

      <Seccion title="Qué datos se tratan">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>De la cuenta:</strong> el correo electrónico con el que se entra y el rol dentro
            del equipo. Es lo mínimo para que cada persona vea solo lo suyo.
          </li>
          <li>
            <strong>De publicidad:</strong> cuando se conecta un perfil de Facebook, se leen las
            cuentas publicitarias a las que ese perfil tiene acceso y sus métricas —campañas,
            conjuntos, anuncios, gasto, impresiones, clics y resultados—. Se pide únicamente el
            permiso <code>ads_read</code>: es de <em>solo lectura</em>. La plataforma{" "}
            <strong>no publica, no modifica ni pausa</strong> nada en tus cuentas, y no accede a
            mensajes, publicaciones, listas de contactos ni datos personales de tus clientes.
          </li>
          <li>
            <strong>De tienda:</strong> cuando se conecta una tienda de Shopify, se leen productos,
            variantes, precios, imágenes y pedidos agregados para calcular el beneficio. No se
            almacenan datos de tarjetas.
          </li>
          <li>
            <strong>De trabajo:</strong> lo que se crea dentro de la plataforma —textos, imágenes,
            vídeos, guiones y páginas— y los archivos que se suben para producirlos.
          </li>
          <li>
            <strong>Credenciales de terceros:</strong> los tokens de acceso que autorizas se guardan
            para poder seguir leyendo esas cuentas sin pedirte sesión cada vez.
          </li>
        </ul>
      </Seccion>

      <Seccion title="Para qué se usan">
        <p>
          Solo para lo que la herramienta hace: leer el rendimiento de la publicidad propia, calcular
          costes y beneficio, y generar creatividades y textos para las marcas de {TITULAR}. No se
          usan para perfilar personas, no se venden y no se ceden a terceros con fines comerciales.
        </p>
      </Seccion>

      <Seccion title="Con quién se comparten">
        <p>
          Con los proveedores necesarios para que la herramienta funcione, y solo con lo que cada uno
          necesita:
        </p>

        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> — base de datos, autenticación y almacenamiento de archivos.
          </li>
          <li>
            <strong>Meta Platforms</strong> — lectura de métricas publicitarias con el permiso que
            autorizas.
          </li>
          <li>
            <strong>Shopify</strong> — lectura del catálogo y de los pedidos de tu propia tienda.
          </li>
          <li>
            <strong>Anthropic</strong> — generación de textos y análisis, a partir de lo que se le
            envía en cada petición.
          </li>
          <li>
            <strong>fal.ai, ElevenLabs, kie.ai y Higgsfield</strong> — generación de imágenes, voz,
            música y vídeo.
          </li>
          <li>
            <strong>Google Ads</strong> — lectura de métricas, solo si conectas una cuenta.
          </li>
        </ul>

        <p>
          Los proveedores de generación reciben únicamente el encargo y los archivos de referencia
          necesarios para producir esa pieza. No reciben tus credenciales de Meta ni de Shopify.
        </p>
      </Seccion>

      <Seccion title="Dónde se guardan y cuánto tiempo">
        <p>
          En Supabase y en un servidor propio, ambos fuera de tu ordenador. Los datos se conservan
          mientras la cuenta esté activa y se borran cuando se pide su borrado o cuando dejan de
          hacer falta.
        </p>
        <p>
          Los vídeos de referencia que se suben para analizarlos <strong>no se conservan</strong>: se
          les sacan fotogramas, se analizan y se descartan.
        </p>
      </Seccion>

      <Seccion title="Cómo se protegen">
        <p>
          El acceso está restringido por cuenta y cada persona solo puede leer y escribir sus propios
          datos, aplicado en la propia base de datos y no solo en la pantalla. Las claves de los
          proveedores viven en el servidor y nunca se envían al navegador. Los archivos privados no
          se publican en carpetas abiertas.
        </p>
      </Seccion>

      <Seccion title="Tus derechos">
        <p>
          Puedes pedir acceso a tus datos, su corrección, su borrado, o retirar una autorización que
          hayas dado. Escribe a{" "}
          <a className="underline underline-offset-2" href={`mailto:${CONTACTO}`}>
            {CONTACTO}
          </a>{" "}
          y se responde en un plazo máximo de 30 días.
        </p>
      </Seccion>

      {/*
        Meta pide esta sección como dirección aparte —«Instrucciones de borrado de
        datos»— y acepta que sea un ancla dentro de la política. Por eso lleva id.
      */}
      <section id="borrado" className="mt-8 scroll-mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Cómo borrar tus datos</h2>

        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          <p>Hay dos formas, y hacen cosas distintas:</p>

          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Desconectar Facebook.</strong> Desde Configuración, quitando la sesión. Eso
              borra el token guardado y la plataforma deja de poder leer tus cuentas
              inmediatamente. También puedes quitarlo desde Facebook, en{" "}
              <em>Configuración → Aplicaciones y sitios web</em>.
            </li>
            <li>
              <strong>Borrar todo.</strong> Escribe a{" "}
              <a className="underline underline-offset-2" href={`mailto:${CONTACTO}`}>
                {CONTACTO}
              </a>{" "}
              desde el correo de tu cuenta pidiendo el borrado. Se elimina la cuenta con todo lo
              asociado —credenciales, métricas descargadas, archivos y piezas generadas— en un plazo
              máximo de 30 días, y se confirma por correo cuando está hecho.
            </li>
          </ol>
        </div>
      </section>

      <Seccion title="Cambios">
        <p>
          Si esta política cambia, se actualiza la fecha de arriba. Los cambios que afecten a cómo se
          tratan los datos se avisan por correo antes de aplicarlos.
        </p>
      </Seccion>

      <Seccion title="Ley aplicable">
        <p>Esta política se rige por la legislación de {JURISDICCION}.</p>
      </Seccion>
    </main>
  );
}
