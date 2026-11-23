#!/bin/sh
# Entrypoint cho container KNIT.
#
# Railway mount volume voi quyen root, nen user `knit` (uid 1001) khong
# tao duoc file SQLite. Script nay chuyen quyen so huu thu muc du lieu
# roi chay tiep process voi quyen thuong.
#
# Fly.io khong can chuyen quyen (volume da owned san) — script van chay
# binh thuong vi `chown` chi doi quyen khi can.
set -e

DATA_DIR="${KNIT_DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Volume cua Railway mount bang root:root, thu muc trong image la
  # knit:knit — chuyen quyen cho ca hai de an toan.
  chown -R knit:knit "$DATA_DIR" 2>/dev/null || true
  # `setpriv` co san trong util-linux cua Debian, khong can them package.
  exec setpriv --reuid=knit --regid=knit --init-groups "$@"
fi

exec "$@"
