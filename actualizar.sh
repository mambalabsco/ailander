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
# Solo lo que haga falta
# ---------------------------------------------------------------------------

if cambio package-lock.json || cambio package.json; then
  echo "== Dependencias =="
  como npm ci --no-audit --no-fund
else
  gris "Dependencias sin cambios."
fi

if cambio supabase/migrations; then
  echo "== Migraciones =="
  # `db:push` solo aplica las que faltan; las ya aplicadas las salta.
  como npm run db:push
else
  gris "Sin migraciones nuevas."
fi

if cambio supabase/config.toml; then
  # No se sube desde aquí: el CLI de Supabase necesita un token personal que
  # solo está en tu portátil. Se avisa para que no pase desapercibido.
  rojo "OJO: cambió supabase/config.toml."
  rojo "Súbelo desde tu Mac:  NEXT_PUBLIC_SITE_URL=https://aitools.mambalabs.co npm run auth:push"
fi

echo "== Compilando =="
como npm run build

echo "== Reiniciando =="
systemctl restart plataforma

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
