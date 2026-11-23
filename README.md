Nền tảng hỏi đáp dành cho sinh viên ULIS — VNU.

## Cấu trúc

- `app/` — web app React + Vite + TypeScript + Tailwind (client)
- `server/` — API Express + SQLite hoặc Postgres (server)
- `shared/` — kiểu dữ liệu dùng chung
- `scripts/` — công cụ phát triển

## Chạy ở local

Cài phụ thuộc:

    npm install
    npm --prefix app install
    npm --prefix server install

Chạy song song API và web:

    npm run dev

- Web: http://localhost:5173
- API: http://localhost:4000/api

Nạp dữ liệu mẫu (xoá sạch rồi nạp lại):

    npm run seed

Tài khoản thử: `a2@ulis.vnu.edu.vn` / `knit1234`

### Chạy local với Postgres (giống hệt môi trường Supabase)

    docker compose --profile postgres up -d db
    npm run migrate
    npm run seed:pg
    $env:KNIT_DB_DRIVER="postgres"
    $env:DATABASE_URL="postgres://knit:knit@localhost:5432/knit"
    npm run dev

Bỏ `KNIT_DB_DRIVER`/`DATABASE_URL` đi thì app quay lại dùng SQLite.

## Build

    npm run build

Kết quả:

- `app/dist` — bản web tĩnh
- `server/dist/index.js` — server đã bundle thành một file ESM

Chạy thử bản production ở local:

    npm run preview

Lệnh này build rồi khởi động server phục vụ cả web tĩnh lẫn API trên
http://localhost:4000 — giống hệt cách chạy trên môi trường deploy.
## Deploy len web

Bang deploy da duoc chuan bi. Khong con "localhost" hardcode trong code:
web va API cung origin, nen mot domain la chay.

### Fly.io (khuyen nghi cho pilot) — DA DEPLOY

App hien tai: **https://knit-ulis.fly.dev** (region `sin` — Singapore,
volume 1 GB ten `knit_data` de SQLite song qua cac lan restart).

Lenh tu do tai len, dung lai:

    npm i -g flyctl
    fly auth login
    fly apps create knit-ulis --org personal
    fly volumes create knit_data --size 1 --app knit-ulis --region sin
    fly secrets set KNIT_SECRET=<chuoi-ngau-nhien> --app knit-ulis
    fly deploy --app knit-ulis --config fly.toml --dockerfile Dockerfile

Luu y: ten app tren Fly.io la TOAN CUC, nen "knit" co the da bi nguoi
khac giu. Region code dung la `sin` (Singapore), khong phai `sgn`.

Sau khi deploy, web tai https://knit-ulis.fly.dev. API cung tai domain do,
duong dan la /api.

Sinh chuoi KNIT_SECRET:

    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

### Cap nhat lan sau (Fly.io)

    git pull
    fly deploy --app knit-ulis --config fly.toml --dockerfile Dockerfile

Doi mat khau/secret:

    fly secrets set KNIT_SECRET=<chuoi-moi> --app knit-ulis
    fly deploy --app knit-ulis --config fly.toml --dockerfile Dockerfile

### Railway (da deploy — chay song song Fly.io)

App: **https://web-production-af92c.up.railway.app**
(project `humorous-luck`, service `web`, region `sfo`, volume 500 MB
`web-volume` gan tai `/data` cho SQLite + anh avatar).

Lenh tu do tai len, dung lai:

    npm i -g @railway/cli
    railway login
    railway link --project <project-id>
    railway service link web
    railway volume add --mount-path /data
    railway variables --service web --set KNIT_SECRET=<chuoi-ngau-nhien>
    railway up --service web

Cau hinh nam trong `railway.json` (Config as Code). Ba luu y:

- **Free plan bat buoc bat serverless** (`sleepApplication: true`). Neu
  server chay lien tuc, Railway bao loi "Free plan deployments must be
  serverless".
- **Volume cua Railway mount bang quyen `root`**, nen container chay bang
  `root` va entrypoint `docker-entrypoint.sh` chuan hoa quyen so huu truoc,
  roi chay app voi quyen `knit`. Neu bo qua, SQLite bao `SQLITE_CANTOPEN`.
- `railway.json` phai dung schema phang (`build` / `deploy` / `environments`),
  khong nest trong `services`.

Kiem tra:

    railway service status --service web
    railway logs --service web --lines 50

### Cap nhat lan sau (ca hai nen tang)

    git pull
    fly deploy --app knit-ulis --config fly.toml --dockerfile Dockerfile
    railway up --service web

### Supabase (Postgres) + Northflank (app)

Kien trúc: Supabase giu database (va Storage cho avatar), Northflank chay
container app va tro `DATABASE_URL` ve Supabase. Northflank **khong** co
persistent volume cho combined service nen SQLite khong dung duoc o day.

#### Buoc 1 — Supabase

Tao project tai supabase.com, roi lay:
- connection string (Project Settings > Database > Connection string > URI,
  port 5432 — session pooler)
- `SUPABASE_ACCESS_TOKEN` (Dashboard > Account > Access Tokens)
- `project ref` (lay tu URL `https://<ref>.supabase.co`)

    $env:SUPABASE_ACCESS_TOKEN="<access-token>"
    $env:SUPABASE_PROJECT_REF="<project-ref>"
    $env:DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
    npm run deploy:supabase

Script nay lam ba viec: `supabase login` → `supabase link` →
`supabase db push` (ap dung `supabase/migrations/0001_init.sql`) →
`npm run seed:pg` (nap du lieu mau).

Neu khong dung CLI duoc, mo **SQL Editor** tren dashboard va chay noi dung
`supabase/migrations/0001_init.sql`, roi nap du lieu mau bang:

    npm run seed:pg

#### Buoc 2 — Storage cho avatar

Dashboard > Storage > New bucket, ten `avatars`, bat **Public**. Container
khong co volume nen `KNIT_AVATAR_DIR` se mat sach khi restart — dung
Storage de anh song lau. Script deploy tu gan `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` va `SUPABASE_STORAGE_BUCKET`.

#### Buoc 3 — Northflank

Khong co CLI Northflank tren npm, nen `scripts/deploy-northflank.mjs` goi
truc tiep REST API `https://api.northflank.com/v1`. Token lay o
**Team Settings > API > Tokens**.

    $env:NORTHFLANK_API_TOKEN="<northflank-api-token>"
    $env:DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
    $env:SUPABASE_URL="https://<ref>.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
    npm run deploy:northflank

Script se:

1. lay team tu token (hoac dung `NORTHFLANK_TEAM_ID` neu token chua gan team),
2. tao project `knit` o region `asia-southeast` (neu chua co),
3. tao combined service `knit-web` build tu `/Dockerfile`, branch `main`,
   cong public `p01` → `4000`,
4. gan bien moi truong runtime (`KNIT_DB_DRIVER=postgres`, `DATABASE_URL`,
   `KNIT_SECRET`, `KNIT_WEB_DIST`, `KNIT_SEED`, va cac bien Storage),
5. kich hoat build va in ra domain public.

Northflank tu cap domain HTTPS (Let's Encrypt). Container chay
`docker-entrypoint.sh` se tu chay migrate + nap du lieu mau (neu database
rong) truoc khi start server, nen khong can chay migration thu cong.

Kiem tra:

    curl https://<domain>/api/health

> **Luu y:** `runtimeEnvironment` va `ports` bi thay the toan bo khi PATCH.
> Script luon gui day du, nen khong mat bien nao. `KNIT_SECRET` duoc sinh
> moi lan chay — neu can giu nguyen, them `NORTHFLANK_KNIT_SECRET` vao bien
> moi truong truoc khi chay script.

### Render

File render.yaml da san. Luu y: Render free KHONG co persistent disk
nen SQLite se mat du lieu moi lan restart. Dung plan co disk, hoac doi
sang Postgres.

    render blueprint launch

### Docker (noi ban tu deploy)

    docker build -t knit .
    docker run -p 4000:4000 -v knit-data:/data -e KNIT_SECRET=CHANGE_ME knit

Hoac dung file san co:

    docker compose up --build

### Bien moi truong

| Bien | Bat buoc | Y nghia |
|---|---|---|
| KNIT_SECRET | Co | Chuoi bi mat ky JWT. Khong co o production thi server tu dung |
| PORT | Khong | Mac dinh 4000 |
| KNIT_DB_DRIVER | Khong | `postgres` hoac `sqlite`. Trong = tu chon theo DATABASE_URL |
| DATABASE_URL | Khong | Chuoi ket noi Postgres (Supabase). Co gia tri -> dung Postgres |
| KNIT_DB | Khong | Duong dan file SQLite, mac dinh ./data/knit.db |
| KNIT_AVATAR_DIR | Khong | Thu muc luu anh avatar, mac dinh ./data/avatars |
| SUPABASE_URL | Khong | URL Supabase — bat Storage cho avatar (khong can volume) |
| SUPABASE_SERVICE_ROLE_KEY | Khong | Key de upload/xoa anh trong Supabase Storage |
| SUPABASE_STORAGE_BUCKET | Khong | Ten bucket avatar, mac dinh `avatars` |
| KNIT_WEB_DIST | Khong | Thu muc web tinh, mac dinh ../app/dist |
| KNIT_SEED | Khong | File du lieu mau, mac dinh ./seed-data.json |
| KNIT_CORS_ORIGINS | Khong | Danh sach origin duoc phep goi API. Rong = chi same-origin |

Copy .env.example thanh .env de xem mau.

### Du lieu mau

Lan dau tien server tu nap du lieu mau neu co so du lieu con trong — de web
mo ra khong bi trong. Co so du lieu day du dau co 8 tai khoan, 10 cau hoi,
19 cau tra loi. Mat khau chung: knit1234.

Khong bao gio du lieu mau ghi de du lieu that, va no chi nap khi bang
questions con rong.

### Truoc khi dua len production

1. Doi mat khau tai khoan mau "knit1234" cho tai khoan admin that.
2. Kiem tra dang nhap admin va phan quyen co hoat dong.
3. Bao dam moi lien ket nguon chinh thuc trong du lieu mau van con dung.
4. Luu y: du lieu mau la du lieu gia lap — can ghi ro noi nguoi dung co
   the nham la that (footer da co ghi chu).

