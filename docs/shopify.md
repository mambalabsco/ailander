# Conectar Shopify

Son dos cosas independientes, y **la primera ya sirve sin la segunda**:

1. **Publicar páginas** — necesita un token de Admin API. Es lo que hace que el
   botón «Publicar en Shopify» funcione.
2. **Repartir tráfico (App Proxy)** — necesita además configurar un proxy. Es lo
   que permite que un mismo anuncio reparta entre varias landings.

Si solo quieres publicar, haz la parte 1 y para.

---

## Antes de empezar: dónde se crean las apps

**Ya no se crean desde el panel de la tienda.** El menú «Ajustes → Apps →
Desarrollar apps» dejó de permitir apps nuevas; las que existían siguen
funcionando. Ahora se crean en el **Dev Dashboard** de Shopify, que necesita una
cuenta de socio —gratuita— en [partners.shopify.com](https://partners.shopify.com).

Suena a más de lo que es: son cinco minutos y se hace una sola vez por tienda.

## Parte 1 · La app y el token

**El token no aparece en pantalla.** Las apps del Dev Dashboard no lo enseñan:
hay que conseguirlo con OAuth, y de eso se encarga la plataforma. Tú solo pegas
la clave y el secreto de la app y pulsas un botón.

Ojo con confundirlos: en la misma pantalla de Shopify verás un valor que empieza
por `shpss_`. **Ese es el secreto, no el token.** El token de acceso empieza por
`shpat_` y solo aparece después del intercambio.

### Los pasos

1. Entra en [partners.shopify.com](https://partners.shopify.com) y crea la cuenta
   si no la tienes.
2. **Apps → Create app → Create app manually.** Ponle un nombre, por ejemplo
   «Ailander».
3. En la app, ve a **Distribution** y elige **Custom distribution**. Escribe el
   dominio de tu tienda: `naturoxmexico.myshopify.com`.

   Esto es lo que la deja privada: solo se instala en esa tienda y no pasa por
   revisión de Shopify.

4. En **Configuration → Admin API access scopes**, marca:

   - `write_content` — crear y actualizar páginas
   - `write_files` — subir las imágenes
   - `read_orders` — leer los pedidos para las pruebas A/B

5. En **Configuration → URLs**, pon:

   - **App URL:** `https://aitools.mambalabs.co`
   - **Allowed redirection URL:** `https://aitools.mambalabs.co/api/shopify/callback`

6. Copia la **Client ID** y el **Client secret** de la app.
7. En la plataforma: **Tiendas** → la tienda → pega los dos → **Guardar
   credenciales**.
8. Escribe el dominio `.myshopify.com` de la tienda y pulsa **Conectar con
   Shopify**. Apruebas los permisos y vuelves solo.

Con eso el botón «Publicar en Shopify» ya funciona.

### Una app por organización

Una app pertenece a la organización donde la creaste y **no se puede instalar en
tiendas de otra**. Si Naturox México y Naturox Chile están en organizaciones
distintas, hacen falta dos apps, una por cada una. La plataforma guarda las
credenciales por tienda justamente por eso.

## Parte 2 · El App Proxy

Es lo que hace que `tutienda.com/apps/lp/loquesea` sirva la landing que decide
tu servidor, sin redirecciones.

En el Dev Dashboard: **Apps → tu app → Versions → Create a version → App proxy**.

Tres campos:

| Campo | Valor |
|---|---|
| Subpath prefix | `apps` |
| Subpath | `lp` |
| Proxy URL | `https://aitools.mambalabs.co/api/lp` |

Añade también el scope `write_app_proxy` en Configuration, y publica la versión.

**Comprueba que funciona** antes de gastar en anuncios: crea una prueba en la
pestaña Landings de la plataforma y abre la URL que te da. Si ves tu
publirreportaje, está listo.

## Parte 3 · El pixel

Sin él, el embudo tiene visitas y compras pero un hueco en medio — justo donde
está la fuga que se puede arreglar.

1. En el panel de la tienda: **Ajustes → Eventos de clientes → Añadir pixel
   personalizado.**
2. Pega el contenido de [`pixel-shopify.js`](./pixel-shopify.js).
3. **Cambia la primera línea** por `https://aitools.mambalabs.co`.
4. Guarda y pulsa **Conectar**.

## Si algo falla

- **«Shopify rechazó el token»** — falta un permiso. Vuelve a Configuration,
  añádelo y **reinstala la app**: los permisos nuevos no se aplican hasta que se
  reinstala.
- **La URL del proxy da 404** — la versión con el App Proxy no está publicada, o
  el subpath no coincide.
- **La página sale sin imágenes** — se publicó antes de subirlas. Pulsa
  «Actualizar en Shopify» después de generarlas.
