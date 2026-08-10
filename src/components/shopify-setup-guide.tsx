"use client";

import { useState } from "react";
import { Copyable } from "@/components/copyable";

/**
 * Cómo crear la app de Shopify que esta plataforma necesita.
 *
 * ## Por qué está aquí y no en un documento
 *
 * Porque se lee **mientras** se hace, con las dos pestañas abiertas. Un manual
 * aparte se busca la primera vez y no se vuelve a encontrar; y lo que se tarda
 * en conectar una tienda no es entender los pasos, es no saber cuáles son los
 * permisos exactos y tener que volver a por ellos de uno en uno, reinstalando la
 * app cada vez.
 *
 * ## Por qué los permisos van en un bloque que se copia
 *
 * Porque son ocho y en el panel de Shopify se buscan por nombre en un buscador.
 * Copiados de una lista se marcan en un minuto; leídos de una captura se falla
 * en uno, y el fallo aparece días después, al publicar, con un error que no
 * dice qué permiso falta.
 */

const SCOPES = [
  { id: "write_products", why: "Crear y editar productos de la tienda." },
  { id: "write_content", why: "Crear las páginas donde viven las landings." },
  { id: "write_online_store_pages", why: "Lo mismo, con el nombre nuevo. Van los dos." },
  { id: "write_files", why: "Subir las imágenes generadas a la biblioteca." },
  { id: "read_orders", why: "Leer las ventas para el panel de resultados." },
  { id: "read_themes", why: "Ver los temas y sus plantillas." },
  { id: "write_themes", why: "Escribir las plantillas de página y de producto." },
  {
    id: "write_theme_code",
    why: "Escribir las secciones y el CSS. Va aparte y viene desmarcado.",
    aviso: true,
  },
];

export function ShopifySetupGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium">Cómo crear la app de Shopify (paso a paso)</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{open ? "Ocultar" : "Ver"}</span>
      </button>

      {open ? (
        <div className="mt-3 grid gap-4 text-sm">
          <ol className="grid gap-2 text-slate-700 dark:text-slate-300">
            <li>
              <strong>1.</strong> En tu Shopify: <em>Configuración → Aplicaciones y canales de
              venta → Desarrollar aplicaciones → Crear una aplicación</em>. Ponle el nombre que
              quieras.
            </li>
            <li>
              <strong>2.</strong> Pestaña <em>Configuración</em> → <em>Admin API</em> →{" "}
              <em>Configurar</em>. Ahí se marcan los permisos de abajo.
            </li>
            <li>
              <strong>3.</strong> <em>Guardar</em>, y luego <em>Instalar aplicación</em>.
            </li>
            <li>
              <strong>4.</strong> Pestaña <em>Credenciales de API</em> → <em>Revelar el token una
              vez</em>. Cópialo y pégalo aquí.
            </li>
          </ol>

          <div>
            <p className="mb-1 font-medium">Los ocho permisos</p>
            <Copyable value={SCOPES.map((one) => one.id).join("\n")} label="los permisos">
              <code className="block whitespace-pre-wrap text-xs leading-5">
                {SCOPES.map((one) => one.id).join("\n")}
              </code>
            </Copyable>

            <ul className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-400">
              {SCOPES.map((one) => (
                <li key={one.id} className={one.aviso ? "text-amber-700 dark:text-amber-400" : ""}>
                  <code>{one.id}</code> — {one.why}
                </li>
              ))}
            </ul>
          </div>

          {/*
            Los tres que hacen perder una tarde. Están aquí y no en el manual de
            Shopify porque los tres se descubren fallando, y ninguno da un error
            que diga lo que pasa.
          */}
          <div className="grid gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              <strong>write_theme_code está en otra sección y viene desmarcado.</strong> Los de tema
              salen en dos sitios: <em>Theme templates</em> trae <code>read_themes</code> y{" "}
              <code>write_themes</code>, y <em>Theme Code</em> trae <code>write_theme_code</code>.
              Sin este último, las landings se publican con el contenido dentro en vez de en
              secciones editables — y no falla al conectar, falla al publicar.
            </p>
            <p>
              <strong>El token se enseña una sola vez.</strong> Si cierras esa pantalla sin
              copiarlo, hay que desinstalar la app y volver a instalarla. Empieza por{" "}
              <code>shpat_</code>.
            </p>
            <p>
              <strong>El dominio es el de <code>.myshopify.com</code></strong>, no el que ven tus
              clientes. Se ve en la barra del navegador al estar dentro del panel.
            </p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Si más adelante añades un permiso, hay que <strong>volver a instalar</strong> la app
            para que el token lo tenga: el que ya tienes conserva los permisos con los que nació.
          </p>
        </div>
      ) : null}
    </div>
  );
}
