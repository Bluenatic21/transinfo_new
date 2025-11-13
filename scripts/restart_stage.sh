#!/usr/bin/env bash
set -Eeuo pipefail

FRONT_UNIT="transinfo-frontend-stage.service"
BACK_UNIT="transinfo-api-stage.service"
FRONT_DIR="/opt/transinfo/frontend-stage"
BACK_DIR="/opt/transinfo/backend-stage"

log(){ echo "[$(date -Iseconds)] $*"; }

prep_front_perms() {
  # Права на фронтовый проект и кеш npm под www-data
  chown -R www-data:www-data "$FRONT_DIR"
  install -d -o www-data -g www-data -m 700 /var/www/.npm
  chown -R www-data:www-data /var/www/.npm
}

restart_front() {
  log "[front] fix permissions & npm cache"
  prep_front_perms

  log "[front] npm ci + build (as www-data)"
  sudo -u www-data HOME=/var/www bash -lc '
    set -e
    export npm_config_cache=/var/www/.npm
    cd "/opt/transinfo/frontend-stage"
    rm -rf node_modules
    npm ci --no-audit --no-fund
    npm run build
  '

  log "[front] systemctl restart $FRONT_UNIT"
  systemctl restart "$FRONT_UNIT"
}

restart_back() {
  log "[back] venv deps (if requirements exist)"
  if [ -x "$BACK_DIR/.venv/bin/python" ]; then
    PY="$BACK_DIR/.venv/bin/python"
    if   [ -f "$BACK_DIR/requirements-stage.txt" ]; then
      sudo -u deploy "$PY" -m pip install -r "$BACK_DIR/requirements-stage.txt"
    elif [ -f "$BACK_DIR/requirements.txt" ]; then
      sudo -u deploy "$PY" -m pip install -r "$BACK_DIR/requirements.txt"
    else
      log "[back] no requirements* — skipping pip install"
    fi
  else
    log "[back] venv not found — skipping deps install"
  fi

  log "[back] systemctl restart $BACK_UNIT"
  systemctl restart "$BACK_UNIT"
}

MODE="${1:-full}"
case "$MODE" in
  fast)  log "[fast] restarting both services"; systemctl restart "$FRONT_UNIT" "$BACK_UNIT" ;;
  front) restart_front ;;
  back)  restart_back ;;
  full|*) restart_front; restart_back ;;
esac

log "[status]"
systemctl --no-pager -l status "$FRONT_UNIT" "$BACK_UNIT" | sed -n '1,100p' || true
log "[done]"
