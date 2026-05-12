## Сервер

```bash
mkdir -p /opt/tierlist/runtime
cd /opt/tierlist
cat > .env <<EOF
ADMIN_TOKEN=придумай-токен
CORS_ALLOWED_ORIGIN=http://127.0.0.1:5174
EOF
curl -O https://raw.githubusercontent.com/Swaeami/tierlist/master/docker-compose.yml
docker compose up -d
```

`CORS_ALLOWED_ORIGIN` — адрес, с которого запускаешь локальную админку.

## Админка

Требует Go 1.23+
```bash
git clone https://github.com/Swaeami/tierlist
cd tierlist
cp admin.local.example.json admin.local.json
```

Заполнить `admin.local.json`:
```json
{
  "listen": "127.0.0.1:5174",
  "api_base_url": "адрес-сервера",
  "admin_token": "токен-из-.env-на-сервере"
}
```

```bash
go build -o admin-tool ./cmd/admin
./admin-tool
```
