#!/bin/sh
# Chay server local kem bien moi truong cho viec kiem thu giao dien.
#
# Dung: sh scripts/dev-local.sh
#
# Doc env tu `.env.local-test` va them `KNIT_WEB_DIST` tro toi ban build web
# moi nhat — `npm run build` trong thu muc `app/`.
set -e

cd "$(dirname "$0")/.."

# Nap bien moi truong tu file env (dong `export` de co shell nhung chay duoc).
set -a
. ./.env.local-test
set +a

KNIT_WEB_DIST="$PWD/app/dist"
export KNIT_WEB_DIST

echo "KNIT_WEB_DIST=$KNIT_WEB_DIST"
exec node server/dist/index.js
