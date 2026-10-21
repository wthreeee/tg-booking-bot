# Деплой на VPS

Бот работает через long polling, поэтому ему не нужен вебхук. HTTPS нужен только для Mini App. Схема: VPS + домен + Caddy (автоматический HTTPS) + systemd.

## 1. Сервер

Подойдёт самый дешёвый VPS (1 ядро, 1 ГБ RAM) с Ubuntu 24.04 у любого хостера. Обычно это 200–500 ₽/мес. Хостинг оформляется **на аккаунт клиента**.

```bash
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs git

# Код
git clone https://github.com/<user>/tg-booking-bot.git /opt/booking
cd /opt/booking
npm ci
npm run build
cp .env.example .env
nano .env   # BOT_TOKEN, ADMIN_IDS, WEBAPP_URL=https://book.example.ru, NODE_ENV=production
```

## 2. HTTPS через Caddy

Направьте A-запись домена (например, `book.example.ru`) на IP сервера.

```bash
sudo apt install -y caddy
echo 'book.example.ru {
  reverse_proxy localhost:3000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy сам получит и будет продлевать сертификат.

## 3. Автозапуск через systemd

```bash
sudo tee /etc/systemd/system/booking.service > /dev/null <<'EOF'
[Unit]
Description=Telegram booking bot
After=network.target

[Service]
WorkingDirectory=/opt/booking
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now booking
journalctl -u booking -f   # логи
```

## 4. Обновление

```bash
cd /opt/booking && git pull && npm ci && npm run build && sudo systemctl restart booking
```

## Резервная копия

Вся база — один файл `server/data/booking.db`. Для бэкапа достаточно копировать его по расписанию (например, через `cron` раз в сутки).
