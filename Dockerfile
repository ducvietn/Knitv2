# syntax=docker/dockerfile:1
#
# KNIT — ảnh Docker duy nhất chứa cả API và web tĩnh.
#
# Build:  docker build -t knit .
# Run:    docker run -p 4000:4000 -v knit-data:/data -e KNIT_SECRET=... knit
#
# Ở production, web và API cùng origin nên không cần cấu hình domain riêng.
#
# Cơ sở dữ liệu: SQLite (mặc định, dữ liệu trên volume) hoặc Postgres
# (khi có `DATABASE_URL` — ví dụ Supabase). Xem `server/src/lib/sql.ts`.

# ---------------------------------------------------------------- dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 cần tool build khi chưa có binary sẵn cho platform này.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/
COPY app/package.json app/package-lock.json* ./app/

# Chỉ cài dependency server — web build không cần node_modules ở stage này.
RUN npm --prefix server ci --omit=dev --include=optional \
  && npm --prefix server install --no-save esbuild@^0.28.2

# --------------------------------------------------------------------- build
FROM deps AS build
WORKDIR /app
COPY server ./server
COPY app ./app
COPY shared ./shared
# Script sinh `schema.generated.ts` tu `server/db/schema.sql`.
# Phai copy ca `scripts` — build stage chay `node scripts/build-schema.mjs`.
COPY scripts ./scripts

# Build web app (Vite) — bản production với API cùng origin.
RUN npm --prefix app ci && npm --prefix app run build

# Sinh `schema.generated.ts` từ `server/db/schema.sql` (nguồn duy nhất).
RUN node scripts/build-schema.mjs

# Bundle server thành một file ESM chạy được.
RUN npm --prefix server run build

# --------------------------------------------------------------------- runtime
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 knit \
  && useradd --system --uid 1001 --gid knit --home /app knit

# Dependency runtime của server (bao gồm better-sqlite3 đã build sẵn).
COPY --from=deps /app/server/node_modules ./server/node_modules

# Mã nguồn server + bản bundle.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/seed-data.json ./server/seed-data.json
COPY --from=build /app/server/package.json ./server/package.json

# Lược đồ Postgres — dùng cho script migration khi chạy với Supabase.
COPY --from=build /app/server/db ./server/db

# Bản build của web app — server phục vụ chúng như file tĩnh.
COPY --from=build /app/app/dist ./app/dist

# Thư mục dữ liệu nằm trên volume để dữ liệu sống sót qua các lần khởi động lại.
#
# KHÔNG khai báo `VOLUME ["/data"]` ở đây: Railway không chấp nhận directive
# đó (phải dùng Railway Volumes).  Volume trên Fly.io khai báo trong
# `fly.toml`, còn local thì dùng `docker-compose.yml` — cả hai đều không
# cần directive trong Dockerfile.
RUN mkdir -p /data && chown -R knit:knit /data /app

# Entrypoint — chuan hoa quyen so huu volume truoc khi chay app.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=4000 \
    KNIT_DB=/data/knit.db \
    KNIT_AVATAR_DIR=/data/avatars \
    KNIT_WEB_DIST=/app/app/dist \
    KNIT_SEED=/app/server/seed-data.json

# Container chay bang root de `docker-entrypoint.sh` co the chuan hoa quyen
# so huu volume (Railway mount volume voi quyen root) roi chay app voi
# quyen `knit` — app van khong chay voi quyen root.
USER root
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
