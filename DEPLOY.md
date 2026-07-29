# Poner la plataforma en un servidor

## Por qué un servidor y no Vercel

Vercel es lo cómodo para Next.js, y aquí **no sirve**. Dos motivos, los dos de fondo:

1. **Nano Banana Pro va por el CLI de Higgsfield**, que es un binario que hay que
   ejecutar y que guarda su sesión en un archivo (`~/.config/higgsfield/`). En
   una función sin servidor no hay disco que sobreviva entre peticiones ni forma
   de dejar esa sesión puesta.

2. **Las generaciones corren en segundo plano con `after()`**, y una tanda de
   investigación pasa de diez minutos. Las funciones sin servidor tienen un tope
   de unos pocos minutos: la tanda se cortaría a media, con el dinero gastado.

Si algún día se renuncia a Nano Banana Pro y a la investigación larga, Vercel
vuelve a ser opción. Mientras tanto, hace falta un proceso que viva.

## Qué máquina

Medido en este proyecto, no estimado:

- **Compilar: 904 MB de pico.** Es la operación que manda.
- **En marcha: 126 MB.** El servicio en sí no consume casi nada; el trabajo
  pesado lo hacen las APIs de Anthropic, Higgsfield y Shopify.

En DigitalOcean, Droplet **Basic Regular de 2 GB / 1 vCPU — 12 USD al mes**.
Los 904 MB del build, más unos 300 MB del sistema y los 126 MB del servicio,
caben con holgura.

El de 1 GB a 6 USD **no vale**: el build se queda sin memoria y lo mata el
sistema. Se puede sortear con swap, pero compilar tarda varias veces más.

Sube a **4 GB / 2 vCPU — 24 USD** solo si quieres compilar mientras la máquina
sirve tráfico sin que se note. Al principio no hace falta.

Disco: los 50 GB del plan de 12 USD sobran (`node_modules` ocupa ~1 GB).

**Región: NYC.** DigitalOcean no tiene centro en Latinoamérica, y NYC es el más
cercano a México. Importa más de lo normal aquí: con el App Proxy, **cada visita
a una landing pasa por este servidor**, y esos milisegundos se suman al tiempo de
carga de tráfico que estás pagando.

## Lo demás que hace falta

- Un dominio apuntando a su IP. **HTTPS es obligatorio**: el App Proxy de Shopify
  no llama a direcciones sin certificado.
- Node 22 o superior.

La base de datos ya está en Supabase, así que no hay nada que migrar.

### Si te quedas en 1 GB de todos modos

Compila en tu portátil y sube el resultado, así el servidor solo ejecuta:

```bash
npm run build
rsync -az .next package.json package-lock.json plataforma@TU_IP:~/plataforma-ia/
ssh plataforma@TU_IP "cd plataforma-ia && npm ci --omit=dev && sudo systemctl restart plataforma"
```

Es más barato y más frágil: cualquier diferencia entre tu máquina y el servidor
—versión de Node, arquitectura— aparece en producción y no al compilar.

## 0. La imagen

**Ubuntu 24.04 LTS.** Es la que trae DigitalOcean por defecto, tiene soporte
hasta 2029 y todo lo que usamos aquí —Node, Caddy— la soporta sin sorpresas.

Ubuntu 26.04 LTS ya existe, pero los repositorios de terceros tardan meses en
darle soporte estable. En una máquina de producción no compensa ir por delante.

## 1. Preparar el servidor

```bash
ssh root@TU_IP

# Node 22 desde el repositorio oficial
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

# Un usuario sin privilegios para la aplicación
adduser --disabled-password --gecos "" plataforma
```

## 2. Subir el código

El proyecto **ya es un repositorio git**, pero no tiene remoto: vive solo en tu
Mac. Hay dos formas de llevarlo al servidor.

### Con GitHub — la recomendada

Actualizar después es un `git pull`, y si un cambio rompe algo se vuelve atrás
con un comando. Crea el repositorio **privado**: el código lleva los prompts, que
son el trabajo de verdad.

```bash
# En tu Mac, dentro del proyecto
git add .
git commit -m "Plataforma completa"

# Crea el repositorio privado en github.com/new y luego:
git remote add origin git@github.com:TU_USUARIO/plataforma-ia.git
git push -u origin main
```

```bash
# En el servidor
su - plataforma
git clone git@github.com:TU_USUARIO/plataforma-ia.git plataforma-ia
cd plataforma-ia && npm ci
```

**Lo que nunca sube, y está comprobado:** `.gitignore` cubre `.env*` y
`/settings`, que son los dos sitios donde hay claves. `.env.example` sí sube, con
todos los valores vacíos, que es para lo que existe.

### Sin GitHub — copiando directamente

Más simple de empezar y más incómodo de mantener: cada actualización es copiar
todo otra vez, y no hay forma de volver atrás.

```bash
rsync -az --exclude node_modules --exclude .next --exclude .env.local \
  --exclude settings --exclude data \
  ~/Desktop/deskal/plataforma-ia/ plataforma@TU_IP:~/plataforma-ia/

ssh plataforma@TU_IP "cd plataforma-ia && npm ci"
```

Fíjate en los `--exclude`: sin ellos subirías tus claves al servidor por un canal
que no las necesita, y `node_modules` entero, que son cientos de megas inútiles
porque `npm ci` los reinstala allí.

## 3. Las variables

Copia tu `.env.local` al servidor. **No lo subas al repositorio.**

```bash
scp .env.local plataforma@TU_IP:~/plataforma-ia/.env.local
```

Y añade allí la URL pública, que Auth y el repartidor de tráfico necesitan:

```
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com
```

## 4. La sesión de Higgsfield

**Este es el paso que se olvida.** El servidor no tiene navegador, así que
`higgsfield auth login` no puede completarse allí. Se copia la sesión ya hecha
desde tu portátil:

```bash
scp -r ~/.config/higgsfield plataforma@TU_IP:~/.config/
```

Son dos archivos: la sesión y el workspace elegido. Las credenciales llevan
`refresh_token`, así que **se renuevan solas** y no hay que repetirlo.

Comprueba que funciona:

```bash
npx higgsfield workspace status --json
```

## 5. Arrancar y que sobreviva a los reinicios

```bash
npm run build
```

Como servicio del sistema, en `/etc/systemd/system/plataforma.service`:

```ini
[Unit]
Description=Plataforma IA
After=network.target

[Service]
Type=simple
User=plataforma
WorkingDirectory=/home/plataforma/plataforma-ia
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

# Las tandas de investigación duran más de diez minutos: si systemd matara el
# proceso por inactividad, se cortarían a media con el dinero ya gastado.
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now plataforma
sudo systemctl status plataforma
```

## 6. HTTPS

Caddy saca el certificado solo. En `/etc/caddy/Caddyfile`:

```
tu-dominio.com {
    reverse_proxy localhost:3000
}
```

Instalando desde **el repositorio oficial de Caddy**, no el de Ubuntu: el que
viene en `universe` va varias versiones por detrás y le faltan arreglos de
seguridad.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

El paquete deja Caddy arrancado como servicio. Después de escribir el
`Caddyfile`:

```bash
systemctl reload caddy
```

El certificado lo saca solo de Let's Encrypt en cuanto el dominio apunte a la
máquina. Si falla, casi siempre es que el DNS todavía no ha propagado.

## 6b. El cortafuegos

Ubuntu trae `ufw`. Hay que abrir HTTP además de HTTPS: Let's Encrypt valida por
el puerto 80, y sin él Caddy no consigue el certificado.

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

El 3000 **no se abre**: solo lo usa Caddy desde la propia máquina.

## 7. Shopify

Está en [docs/shopify.md](docs/shopify.md), con los pasos completos.

Un aviso que costó descubrir: **las apps ya no se crean desde el panel de la
tienda**. Shopify retiró esa opción y ahora se hacen en el Dev Dashboard, con una
cuenta de socio gratuita. Las apps antiguas siguen funcionando, pero una nueva no
se puede crear por ahí.

## 8. Las URLs de Auth

Supabase tiene que aceptar el dominio nuevo:

```bash
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com npm run auth:push
```

Y añade `https://tu-dominio.com/auth/callback` a `additional_redirect_urls` en
`supabase/config.toml` antes de subirlo. Sin eso, el enlace de confirmación de
los correos no vuelve a la aplicación.

## Actualizar después

Un solo comando:

```bash
cd /home/plataforma/plataforma-ia && sudo ./actualizar.sh
```

Hace solo lo que hace falta: trae los cambios, reinstala dependencias **solo si
cambiaron**, aplica migraciones **solo si hay nuevas**, compila, reinicia y
comprueba que la aplicación responde de verdad —no solo que el proceso viva—.

Si no hay nada nuevo, lo dice y sale en un segundo.

Dos cosas que avisa pero no hace:

- **Si cambió `supabase/config.toml`**, te recuerda subirlo desde tu Mac: el CLI
  de Supabase necesita un token personal que no está en el servidor.
- **Si el arranque falla**, imprime las últimas líneas del registro en vez de
  dejarte adivinando.

## Nunca actualices a mano

```bash
git pull && systemctl restart plataforma   # ← esto NO actualiza nada
```

`next start` sirve un paquete **ya compilado**. Traer el código y reiniciar deja
la aplicación exactamente igual que estaba, y el resultado es el fallo más
desconcertante posible: la versión correcta en el disco y la interfaz vieja en
pantalla.

Usa siempre `sudo ./actualizar.sh`, que compila. Y si alguna vez se cuela un
`git pull` suelto, el actualizador lo detecta —compara la fecha del build con la
del último commit— y recompila solo.

## Lo que hay que vigilar

- **Los trabajos en marcha mueren al reiniciar.** El panel los marca como
  «Perdido» pasada media hora. Conviene reiniciar cuando no haya nada corriendo.
- **`npm run logs`** funciona igual en el servidor y es la forma rápida de ver
  qué falló.
