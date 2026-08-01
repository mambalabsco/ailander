#!/usr/bin/env bash
#
# Actualiza la plataforma en el servidor. Un solo comando:
#
#   cd /home/plataforma/plataforma-ia && sudo ./actualizar.sh
#
# Hace solo lo que hace falta: si no cambiaron las dependencias no reinstala, si
# no hay migraciones nuevas no toca la base de datos. Una actualización de solo
# código tarda unos segundos.

set -euo pipefail

USUARIO="plataforma"
CARPETA="/home/$USUARIO/plataforma-ia"
CLAVE="/home/$USUARIO/.ssh/id_ed25519"

rojo()  { printf "\033[31m%s\033[0m\n" "$*"; }
verde() { printf "\033[32m%s\033[0m\n" "$*"; }
gris()  { printf "\033[2m%s\033[0m\n" "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Ejecútalo con sudo."; exit 1; }

export GIT_SSH_COMMAND="ssh -i $CLAVE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
como() { sudo -u "$USUARIO" -H env GIT_SSH_COMMAND="$GIT_SSH_COMMAND" "$@"; }

cd "$CARPETA"

# ---------------------------------------------------------------------------
# Traer los cambios
# ---------------------------------------------------------------------------

ANTES=$(como git rev-parse HEAD)
gris "Versión actual: ${ANTES:0:8}"

echo "== Trayendo cambios =="
como git pull --ff-only

DESPUES=$(como git rev-parse HEAD)

# ---------------------------------------------------------------------------
# ¿Está compilado lo que hay en el disco?
#
# `next start` sirve un paquete **ya compilado**: traer código con `git pull` y
# reiniciar el servicio no cambia nada de lo que ve el visitante. Es el fallo
# más desconcertante posible —la versión correcta en el disco, la interfaz vieja
# en pantalla— y pasó de verdad.
#
# Se compara la fecha del último commit con la del build.
# ---------------------------------------------------------------------------

build_viejo() {
  [ -f .next/BUILD_ID ] || return 0
  local commit build
  commit=$(como git log -1 --format=%ct)
  build=$(stat -c %Y .next/BUILD_ID 2>/dev/null || echo 0)
  [ "$build" -lt "$commit" ]
}

if [ "$ANTES" = "$DESPUES" ]; then
  if build_viejo; then
    rojo "No hay cambios nuevos, pero lo compilado es más antiguo que el código."
    rojo "Seguramente se hizo un «git pull» sin compilar. Se arregla ahora."
    como npm run build
    systemctl restart plataforma
    sleep 4
    verde "Recompilado."
  else
    verde "Ya estaba al día."
  fi

  gris "Versión: $(como git rev-parse --short HEAD) — $(como git log -1 --pretty=%s)"
  exit 0
fi

# Este script acaba de actualizarse a sí mismo.
#
# Lo que está corriendo ahora es la versión vieja, leída del disco antes del
# pull. Si la nueva trae pasos distintos, no se aplicarían. Se vuelve a lanzar
# una sola vez, con una marca para no entrar en bucle.
if [ "${YA_RELANZADO:-}" != "1" ] && ! como git diff --quiet "$ANTES" "$DESPUES" -- actualizar.sh; then
  gris "El actualizador cambió: relanzando la versión nueva."
  YA_RELANZADO=1 exec "$CARPETA/actualizar.sh"
fi

gris "Nueva versión: ${DESPUES:0:8}"
como git log --oneline "$ANTES..$DESPUES" | sed 's/^/  /'

cambio() { ! como git diff --quiet "$ANTES" "$DESPUES" -- "$1"; }

# ---------------------------------------------------------------------------
# Solo lo que haga falta — pero comparando contra el ESTADO, no contra el pull
#
# **Aquí hubo un fallo que dejó la base de datos vieja con el código nuevo.**
# Estos pasos se decidían con `cambio()`, que solo mira lo que trajo *este*
# `git pull`. Si el código ya estaba bajado —un `git pull` a mano, o una pasada
# anterior que falló después— entonces ANTES y DESPUES son iguales, no se
# detecta ningún cambio y **las migraciones se saltan**. El build sí se rehacía,
# porque aquel usa una comprobación de estado, así que el resultado era una
# interfaz nueva consultando tablas que no existían.
#
# La lección: comparar contra lo que se acaba de traer supone que el disco
# estaba sincronizado antes de empezar, y eso no se puede suponer. Cada paso
# mira ahora si su propio resultado está al día.
# ---------------------------------------------------------------------------

# npm escribe `node_modules/.package-lock.json` al instalar, así que comparar
# las dos fechas dice si lo instalado corresponde a lo declarado — venga el
# cambio de donde venga.
deps_viejas() {
  [ -d node_modules ] || return 0
  [ -f node_modules/.package-lock.json ] || return 0
  [ package-lock.json -nt node_modules/.package-lock.json ]
}

if deps_viejas; then
  echo "== Dependencias =="
  como npm ci --no-audit --no-fund
else
  gris "Dependencias al día."
fi

# Las migraciones se lanzan **siempre**.
#
# `db:push` ya es idempotente: lleva su propio registro y solo aplica las que
# faltan. Ponerle una condición delante no ahorraba nada —tarda un par de
# segundos cuando no hay nada que hacer— y era justo lo que permitía saltárselas.
echo "== Migraciones =="
como npm run db:push

if cambio supabase/config.toml; then
  # No se sube desde aquí: el CLI de Supabase necesita un token personal que
  # solo está en tu portátil. Se avisa para que no pase desapercibido.
  rojo "OJO: cambió supabase/config.toml."
  rojo "Súbelo desde tu Mac:  NEXT_PUBLIC_SITE_URL=https://aitools.mambalabs.co npm run auth:push"
fi

# Las pruebas van antes de compilar, y frenan el despliegue si fallan.
#
# Son las del motor de beneficio y de los rangos de fecha: pura aritmética, sin
# red ni base de datos, así que tardan menos de un segundo. Y cubren justo la
# clase de fallo que no se nota mirando la pantalla — una cifra equivocada sigue
# pareciendo una cifra.
echo "== Pruebas =="
if ! npm test --silent; then
  rojo "Las pruebas fallan. NO se despliega: alguna cifra saldría mal."
  exit 1
fi

# ---------------------------------------------------------------------------
# Memoria: la causa de que un despliegue se quede clavado
#
# Esta máquina tiene 4 GB y al compilar hay **dos** cosas grandes a la vez: el
# compilador y el servidor viejo, que sigue atendiendo visitas. Sin espacio de
# intercambio, el núcleo mata a una de las dos — normalmente al servidor — y el
# resultado es el sitio caído a mitad de actualización, que es justo cuando nadie
# está mirando los registros.
#
# Se avisa en vez de crearlo solo: el intercambio es un archivo permanente en tu
# disco y esa decisión es tuya.
# ---------------------------------------------------------------------------

SWAP_KB=$(awk '/SwapTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)

if [ "${SWAP_KB:-0}" -lt 262144 ]; then
  rojo "AVISO: esta máquina no tiene espacio de intercambio."
  rojo "Compilar con 4 GB y el servidor en marcha puede dejar el sitio caído."
  rojo "Se arregla una sola vez, con esto:"
  gris "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
  gris "  sudo mkswap /swapfile && sudo swapon /swapfile"
  gris "  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
fi

echo "== Compilando =="
# Con el techo puesto, el compilador se contiene en vez de crecer hasta que el
# núcleo tenga que elegir a quién matar.
como env NODE_OPTIONS=--max-old-space-size=2048 npm run build

# ---------------------------------------------------------------------------
# Reiniciar, con plazo
#
# `systemctl restart` espera a que el proceso viejo muera. Si no atiende la
# señal, se queda esperando el plazo entero de systemd y parece colgado; quien
# lo está mirando cierra la terminal y se queda sin saber en qué estado quedó.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Un reinicio mata lo que esté generándose
#
# El trabajo corre dentro del proceso del servidor: reiniciar a mitad de una
# tanda de secciones la corta y hay que retomarla. Se reutiliza lo hecho, así que
# no se pierde dinero, pero sí el rato — y pasó varias veces por no saberlo.
#
# Se avisa y se sigue: parar el despliegue por esto sería peor, porque el arreglo
# que trae suele ser justo el que hacía falta.
# ---------------------------------------------------------------------------

if curl -s --max-time 5 http://localhost:3000/auth/login >/dev/null 2>&1; then
  gris "Si tenías algo generándose, el reinicio lo corta: retómalo con «Continuar»."
fi

echo "== Reiniciando =="

if ! timeout 90 systemctl restart plataforma; then
  rojo "No terminó de reiniciar en 90 s. Forzando."
  systemctl kill -s SIGKILL plataforma || true
  sleep 2
  systemctl start plataforma
fi

# ---------------------------------------------------------------------------
# Comprobar que quedó viva
# ---------------------------------------------------------------------------

sleep 4

if ! systemctl is-active --quiet plataforma; then
  rojo "El servicio NO arrancó. Últimas líneas:"
  journalctl -u plataforma -n 25 --no-pager
  exit 1
fi

# Que el proceso esté vivo no significa que responda: se comprueba de verdad.
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 http://localhost:3000/auth/login || echo "000")

if [ "$CODIGO" = "200" ]; then
  verde "Listo. La aplicación responde."
  # Se imprime la versión desplegada: sin esto, «actualicé» y «no se ve el
  # cambio» son indistinguibles y hay que investigar a ciegas.
  gris "Versión desplegada: $(como git rev-parse --short HEAD) — $(como git log -1 --pretty=%s)"
else
  rojo "El servicio arrancó pero /auth/login devolvió $CODIGO."
  rojo "Mira:  journalctl -u plataforma -n 40"
  exit 1
fi
