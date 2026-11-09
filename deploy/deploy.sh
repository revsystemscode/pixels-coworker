#!/bin/sh
# Despliega en el servidor la versión indicada (commit, rama o etiqueta; por defecto, origin/main):
#   ./deploy/deploy.sh [versión]
# Construye las imágenes, aplica las migraciones y reinicia lo que haya cambiado. Comprueba que la
# web, la API y el servidor de juego respondan; si no, sale con error (el workflow lo marca fallido).
set -eu
cd "$(dirname "$0")/.."
version="${1:-origin/main}"

git fetch --quiet --tags origin
git checkout --quiet --detach "$version"
echo "Desplegando $(git log -1 --format='%h %s')"

cd deploy
. ./.env
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f >/dev/null

for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null && curl -fsS "https://$DOMAIN/game/health" >/dev/null; then
    echo "Listo: https://$DOMAIN"
    exit 0
  fi
  sleep 2
done
echo "ERROR: la API o el servidor de juego no responden. Mira: docker compose -f docker-compose.prod.yml logs" >&2
exit 1
