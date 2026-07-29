#!/usr/bin/env bash
#
# Prepara un servidor Ubuntu 24.04 para la plataforma.
#
# Va en dos fases porque en medio hace falta que una persona pegue una clave en
# GitHub, y eso no se puede automatizar desde aquí:
#
#   ./server-setup.sh preparar   → instala, crea el usuario y da la clave
#   ./server-setup.sh desplegar  → clona, compila y deja el servicio en marcha
#
# Se ejecuta como root, en el servidor.

set -euo pipefail

REPO="git@github.com:mambalabsco/ailander.git"
USUARIO="plataforma"
CARPETA="/home/$USUARIO/plataforma-ia"
CLAVE="/home/$USUARIO/.ssh/id_ed25519"

# La clave se indica **explícitamente**, no se deja que ssh la busque.
#
# `sudo -u usuario` no cambia HOME de forma fiable entre versiones: ssh acababa
# mirando en /root/.ssh, no encontraba nada, y GitHub rechazaba la conexión sin
# haber visto siquiera la clave del servidor —que en GitHub aparecía como «nunca
# usada», que era la pista—.
export GIT_SSH_COMMAND="ssh -i $CLAVE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

# Igual que arriba, pero para invocar ssh a mano.
como_usuario() { sudo -u "$USUARIO" -H env GIT_SSH_COMMAND="$GIT_SSH_COMMAND" "$@"; }

rojo()  { printf "\033[31m%s\033[0m\n" "$*"; }
verde() { printf "\033[32m%s\033[0m\n" "$*"; }
aviso() { printf "\033[33m%s\033[0m\n" "$*"; }

[ "$(id -u)" -eq 0 ] || { rojo "Ejecútalo como root."; exit 1; }

preparar() {
  echo "== Paquetes del sistema =="
  apt-get update -qq
  # `ca-certificates` y `curl` hacen falta antes de añadir cualquier repositorio.
  apt-get install -y -qq ca-certificates curl gnupg git ufw

  if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
    echo "== Node 22 =="
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs
  fi
  verde "Node $(node -v)"

  if ! id "$USUARIO" >/dev/null 2>&1; then
    echo "== Usuario $USUARIO =="
    adduser --disabled-password --gecos "" "$USUARIO"
  fi

  # Una clave del servidor, no la del portátil: si algún día se compromete la
  # máquina, se revoca esta sola y sin tocar la cuenta personal.
  if [ ! -f "/home/$USUARIO/.ssh/id_ed25519" ]; then
    echo "== Clave de despliegue =="
    sudo -u "$USUARIO" mkdir -p "/home/$USUARIO/.ssh"
    # ssh se niega a usar un directorio que otros puedan leer.
    chmod 700 "/home/$USUARIO/.ssh"
    sudo -u "$USUARIO" ssh-keygen -t ed25519 -N "" -q \
      -C "servidor-$(hostname)" -f "$CLAVE"
  fi
  chmod 700 "/home/$USUARIO/.ssh"
  chmod 600 "$CLAVE"
  chown -R "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh"

  # Se acepta la huella de GitHub de antemano, para que el clonado no se quede
  # esperando una confirmación interactiva.
  ssh-keyscan -t ed25519 github.com 2>/dev/null >> "/home/$USUARIO/.ssh/known_hosts"
  sort -u -o "/home/$USUARIO/.ssh/known_hosts" "/home/$USUARIO/.ssh/known_hosts"
  chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/known_hosts"

  echo
  verde "Listo. Ahora pega esta clave en GitHub:"
  echo
  cat "/home/$USUARIO/.ssh/id_ed25519.pub"
  echo
  aviso "  Repositorio → Settings → Deploy keys → Add deploy key"
  aviso "  Título: el que quieras.  NO marques «Allow write access»."
  echo
  echo "Cuando esté puesta:  ./server-setup.sh desplegar"
}

desplegar() {
  echo "== Comprobando el acceso a GitHub =="
  # Una clave de despliegue responde «Hi organizacion/repo!», no «Hi usuario!»,
  # así que se busca la parte común de las dos respuestas.
  respuesta=$(como_usuario ssh -i "$CLAVE" -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true)

  if ! grep -q "successfully authenticated" <<<"$respuesta"; then
    rojo "GitHub no aceptó la clave del servidor. Respondió:"
    echo "  $respuesta"
    echo
    aviso "Comprueba que esta clave está en Deploy keys del repositorio:"
    cat "/home/$USUARIO/.ssh/id_ed25519.pub"
    exit 1
  fi
  verde "Acceso confirmado: ${respuesta%%,*}"

  if [ ! -d "$CARPETA/.git" ]; then
    echo "== Clonando =="
    como_usuario git clone "$REPO" "$CARPETA"
  else
    echo "== Actualizando =="
    como_usuario git -C "$CARPETA" pull --ff-only
  fi

  if [ ! -f "$CARPETA/.env.local" ]; then
    rojo "Falta $CARPETA/.env.local"
    echo
    echo "Cópialo desde tu Mac, en UNA sola línea:"
    echo "  scp ~/Desktop/deskal/plataforma-ia/.env.local root@$(hostname -I | awk '{print $1}'):$CARPETA/"
    echo "  ssh root@$(hostname -I | awk '{print $1}') chown $USUARIO:$USUARIO $CARPETA/.env.local"
    exit 1
  fi

  echo "== Dependencias y compilación =="
  sudo -u "$USUARIO" -H bash -c "cd '$CARPETA' && npm ci --no-audit --no-fund && npm run build"

  echo "== Servicio =="
  cat > /etc/systemd/system/plataforma.service <<UNIT
[Unit]
Description=Plataforma IA
After=network.target

[Service]
Type=simple
User=$USUARIO
WorkingDirectory=$CARPETA
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

# Las tandas de investigación duran más de diez minutos: un plazo corto aquí
# las cortaría a media con el dinero ya gastado.
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now plataforma
  sleep 3
  systemctl is-active --quiet plataforma && verde "Servicio en marcha." || rojo "El servicio no arrancó: journalctl -u plataforma -n 40"

  if ! command -v caddy >/dev/null; then
    echo "== Caddy =="
    # Del repositorio oficial: el de Ubuntu va varias versiones por detrás.
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy
  fi

  echo "== Cortafuegos =="
  # El 80 también: Let's Encrypt valida por ahí, y sin él no hay certificado.
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp   >/dev/null
  ufw allow 443/tcp  >/dev/null
  ufw --force enable >/dev/null
  verde "Abiertos 22, 80 y 443. El 3000 queda solo para Caddy."

  echo
  verde "Hecho. Falta lo que necesita tu dominio:"
  echo
  echo "  1. Apunta un registro A a $(hostname -I | awk '{print $1}')"
  echo "  2. Escribe /etc/caddy/Caddyfile:"
  echo
  echo "       tu-dominio.com {"
  echo "           reverse_proxy localhost:3000"
  echo "       }"
  echo
  echo "  3. systemctl reload caddy"
  echo "  4. Copia la sesión de Higgsfield desde tu Mac:"
  echo "       scp -r ~/.config/higgsfield root@$(hostname -I | awk '{print $1}'):/home/$USUARIO/.config/"
  echo "       ssh root@$(hostname -I | awk '{print $1}') chown -R $USUARIO:$USUARIO /home/$USUARIO/.config"
}

case "${1:-}" in
  preparar)  preparar ;;
  desplegar) desplegar ;;
  *) echo "Uso: $0 preparar | desplegar"; exit 1 ;;
esac
