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
