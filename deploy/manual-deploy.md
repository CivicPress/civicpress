# CivicPress Manual Deployment Guide

## 🚀 Quick Setup on EC2

### 1. SSH into your server

```bash
ssh -i your-key.pem ubuntu@18.207.126.22
```

### 2. Update system and install dependencies

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm
sudo apt install nginx git -y
sudo npm install -g pm2
```

### 3. Clone and setup the app

```bash
mkdir -p /home/ubuntu/civicpress
cd /home/ubuntu/civicpress
git clone https://github.com/CivicPress/civicpress.git .
pnpm install
```

### 4. Create environment file

```bash
cat > modules/ui/.env << EOF
NUXT_UI_PRO_LICENSE=8A30A1BD-ED97-4FB5-8C71-B3A149C9655E
NUXT_PUBLIC_API_BASE_URL=https://demo-api.civic-press.org
NODE_ENV=production
EOF
```

### 5. Build the UI

```bash
cd modules/ui
pnpm install
pnpm run build
cd /home/ubuntu/civicpress
```

### 6. Configure Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/civicpress
sudo ln -sf /etc/nginx/sites-available/civicpress /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Start services

```bash
pm2 start modules/api/src/index.ts --name civicpress-api --interpreter tsx
pm2 start modules/ui/.output/server/index.mjs --name civicpress-ui
pm2 save
pm2 startup
```

### 8. Setup SSL (after DNS propagation)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d demo-api.civic-press.org -d demo.civic-press.org --non-interactive --agree-tos --email m@civic-press.org
```

## 🌐 DNS Records (Cloudflare)

- **demo-api.civic-press.org** → A record → `18.207.126.22`
- **demo.civic-press.org** → A record → `18.207.126.22`

## 📊 Check Status

```bash
pm2 status
pm2 logs
```
