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

### Supabase (Postgres) + Render (app)

Kien truc: Supabase giu database (va Storage cho avatar), Render chay
container app va tro `DATABASE_URL` ve Supabase. Render free **khong** co
persistent disk nen SQLite khong dung duoc o day — Postgres la bat buoc.

#### Buoc 1 — Supabase: tao project va nap du lieu

Tao project tai supabase.com. Sau do:

    supabase login --token <access-token>
    supabase link --project-ref <project-ref>

`supabase link` (khong dung `--skip-pooler`) sinh file
`supabase/.temp/pooler-url` chua **chuoi ket noi pooler** cua project —
dung chinh chuoi nay, vi ten host pooler co dang `aws-<N>-<region>` (N khong
phai luon la `0`).

Truyen chuoi do vao bien moi truong:

    $env:DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"

> **Vi sao dung pooler chu khong dung direct connection?**
> Direct connection (`db.<ref>.supabase.co`) chi co **IPv6** — may local
> Windows thuong khong co IPv6 native nen ket noi se timeout. Pooler ho tro
> ca IPv4 va IPv6, dung cho moi noi (Render, may local) deu an toan.

Ap dung luoc do + nap du lieu mau:

    npm run migrate
    npm run seed:pg

`npm run migrate` doc `server/db/schema.sql` (dung `IF NOT EXISTS` nen chay
lap nhieu lan cung an toan). `npm run seed:pg` nap `server/seed-data.json`:
8 tai khoan · 10 cau hoi · 19 cau tra loi, mat khau chung `knit1234`.

Neu khong dung CLI duoc, mo **SQL Editor** tren dashboard va chay noi dung
`supabase/migrations/0001_init.sql`, roi nap du lieu mau bang `npm run seed:pg`.

#### Buoc 2 — Storage cho avatar

Dashboard > Storage > New bucket, ten `avatars`, bat **Public**. Container
khong co volume nen `KNIT_AVATAR_DIR` se mat sach khi restart — dung
Storage de anh song lau. Lay `SUPABASE_URL` va `SUPABASE_SERVICE_ROLE_KEY`
o Project Settings > API.

#### Buoc 3 — Render

Render deploy tu `Dockerfile` (build ben trong Render, khong can push image).
Cach nhanh nhat la **Blueprint**:

1. Day code len GitHub (da co san).
2. Tren Render: **New > Blueprint**, chon repo `ducvietn/Knitv2`.
3. Render doc `render.yaml` va tao web service. Cac bien `sync: false`
   (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) se hoi ban
   nhap gia tri — dien vao **Settings > Environment** cua service sau khi
   tao neu blueprint bo qua.

Bien moi truong can co:

| Bien | Gia tri |
|---|---|
| `KNIT_DB_DRIVER` | `postgres` |
| `DATABASE_URL` | chuoi pooler tu Buoc 1 |
| `KNIT_SECRET` | Render tu sinh (`generateValue: true`) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |

Container chay `docker-entrypoint.sh` se tu chay migrate + nap du lieu mau
(neu database rong) truoc khi start server, nen khong can chay migration thu
cong tren Render. Deploy lai khong lam mat du lieu.

Kiem tra:

    curl https://<service>.onrender.com/api/health

> **Render free co gioi han dung luong.** Free service ngung sau 15 phut
> khong co request, va `sleep` thuong keo dai ~50 giay lan khoi dong lai.
> Neu can luon online, dung plan `starter` ($7/thang).

#### Giu Render khong bi ngu (free plan)

Render free **ngung service sau 15 phut khong co request nao**. Khi bi ngu,
trang tra ve loi 502/503 va lan khoi dong lai ton tai ~50 giay.

Cach giai quyet cho repo nay (repo **public**, nen GitHub Actions cap tieu):

| Cach | Chi phi | Do tin cay |
|---|---|---|
| `.github/workflows/keep-alive.yml` — cron moi 5 phut goi `/api/health` | $0 | Gioi han do GitHub delay cron |
| Upwork / cron-job.org / Render cron service | $0-5/thang | Phu thuoc dich vu ben ngoai |

**Cach da dung trong repo (khuyen nghi):**

    .github/workflows/keep-alive.yml

Workflow chay `GET https://knitv2.onrender.com/api/health` moi 5 phut. Nhanh
hon 15 phut de chắc chắn timer cua Render khong bao gio reset. Co `retry`
3 lan vi free plan hay cold start (~50 giay).

> **Luu y ve gioi han cua GitHub Actions:** job cron tren repo public **khong
> bao gio bi delay** (chi private repo moi co the delay 5-30 phut). Repo nay
> public nen ping 5 phut la du reliable.

> **Can mo workflow:** repo public nen workflow tu dong chay ngay khi push
> len `main`. Neu khong thay, vao tab **Actions > Keep KNIT awake** va bam
> **Enable workflow**.

> **Cau hinh `render.yaml`:** khi deploy lai qua Blueprint, Render se dung
> `plan: free` va `healthCheckPath: /api/health` san. Khong can doi gi them.

**Neu van bi ngu** (vi du: workflow chua duoc bat, hoac Render deploy lai
va lam workflow bi tre): vao Render Dashboard > service `knit` > **Manual
Deploy** > **Restart** de mo lai ngay.


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

