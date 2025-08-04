#!/bin/bash

# CivicPress EC2 Deployment Script
# Run this on your Ubuntu 24.04 EC2 instance

echo "🚀 Setting up CivicPress on EC2..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
echo "📦 Installing pnpm..."
sudo npm install -g pnpm

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install nginx -y

# Install Git
echo "📦 Installing Git..."
sudo apt install git -y

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /home/ubuntu/civicpress
cd /home/ubuntu/civicpress

# Clone the repository
echo "📥 Cloning CivicPress repository..."
git clone https://github.com/CivicPress/civicpress.git .

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Create production environment file
echo "🔧 Creating production environment..."
cat > modules/ui/.env << EOF
# Nuxt UI Pro License
NUXT_UI_PRO_LICENSE=8A30A1BD-ED97-4FB5-8C71-B3A149C9655E

# Production API URL
NUXT_PUBLIC_API_BASE_URL=https://demo-api.civic-press.org

# Build settings
NODE_ENV=production
EOF

# Build the UI
echo "🔨 Building UI..."
cd modules/ui
pnpm install  # Ensure UI dependencies are installed
pnpm run build

# Go back to root
cd /home/ubuntu/civicpress

echo "✅ Setup complete! Next steps:"
echo "1. Configure Nginx (see deploy/nginx.conf)"
echo "2. Start the API: pm2 start modules/api/src/index.ts --name civicpress-api"
echo "3. Start the UI: pm2 start modules/ui/.output/server/index.mjs --name civicpress-ui"
echo "4. Configure SSL with Let's Encrypt" 