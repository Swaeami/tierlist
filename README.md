# games-tierlist

Веб-приложение для создания тирлиста игр. Публичный сайт отдаёт статику, редактирование — через локальную админку.

## Структура

```
cmd/server   — публичный сервер (сайт + API)
cmd/admin    — локальная админка (проксирует запросы на сервер)
internal/    — общий код
```

---

## Деплой сервера

### Требования

- Linux сервер с Docker и docker compose
- Домен, указывающий на IP сервера

### 1. Подготовить директорию

```bash
mkdir -p /opt/tierlist/runtime
cd /opt/tierlist
```

### 2. Создать `.env`

```bash
cat > .env <<EOF
ADMIN_TOKEN=придумай-токен
CORS_ALLOWED_ORIGIN=http://127.0.0.1:5174
EOF
```

`CORS_ALLOWED_ORIGIN` — адрес, с которого запускаешь локальную админку.

### 3. Скачать `docker-compose.yml` и запустить

```bash
curl -O https://raw.githubusercontent.com/Swaeami/tierlist/master/docker-compose.yml
docker compose up -d
```

Сервер слушает на `127.0.0.1:8087`.

### 4. Настроить nginx

```nginx
server {
    listen 80;
    server_name ваш-домен.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name ваш-домен.ru;

    ssl_certificate     /etc/nginx/ssl/ваш-домен.ru/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/ваш-домен.ru/key.pem;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8087;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Получить SSL-сертификат через acme.sh

```bash
curl https://get.acme.sh | sh -s email=ваш@email.com
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt

sudo mkdir -p /etc/nginx/ssl/ваш-домен.ru
sudo chown -R $USER /etc/nginx/ssl

~/.acme.sh/acme.sh --issue -d ваш-домен.ru -w /var/www/html
~/.acme.sh/acme.sh --install-cert -d ваш-домен.ru \
    --fullchain-file /etc/nginx/ssl/ваш-домен.ru/fullchain.pem \
    --key-file      /etc/nginx/ssl/ваш-домен.ru/key.pem \
    --reloadcmd     "sudo systemctl reload nginx"
```

Сертификат обновляется автоматически через cron.

---

## CI/CD (GitHub Actions)

При каждом пуше в `master` автоматически собирается Docker-образ и деплоится на сервер.

Добавь секреты в `Settings → Secrets → Actions`:

| Секрет | Значение |
|---|---|
| `SSH_HOST` | IP сервера |
| `SSH_USER` | Пользователь SSH |
| `SSH_PRIVATE_KEY` | Приватный SSH-ключ |

---

## Локальная админка

Требует Go 1.23+.

### 1. Склонировать репозиторий

```bash
git clone https://github.com/Swaeami/tierlist
cd tierlist
```

### 2. Создать конфиг

```bash
cp admin.local.example.json admin.local.json
```

Заполнить `admin.local.json`:

```json
{
  "listen": "127.0.0.1:5174",
  "api_base_url": "https://ваш-домен.ru",
  "admin_token": "токен-из-.env-на-сервере"
}
```

### 3. Запустить

```bash
go run ./cmd/admin
```

Открыть `http://127.0.0.1:5174`.

### Или собрать бинарник

```bash
go build -o admin-tool ./cmd/admin
./admin-tool
```

Бинарник самодостаточный — статика вшита внутрь, папка `admin/` рядом не нужна.
