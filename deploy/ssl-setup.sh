#!/bin/bash

# CivicPress SSL Setup Script
# Domains: demo-api.civic-press.org, demo.civic-press.org
# Email: m@civic-press.org

echo "🔒 Setting up SSL with Let's Encrypt..."

# Install Certbot
echo "📦 Installing Certbot..."
sudo apt install certbot python3-certbot-nginx -y

# Update Nginx config with domains
echo "🔧 Updating Nginx configuration..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/civicpress

# Enable the site
echo "🔗 Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/civicpress /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# Reload Nginx
echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

# Get SSL certificates for both domains
echo "🔒 Getting SSL certificates..."
sudo certbot --nginx -d demo-api.civic-press.org -d demo.civic-press.org --non-interactive --agree-tos --email m@civic-press.org

# Set up auto-renewal
echo "🔄 Setting up auto-renewal..."
sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -

echo "✅ SSL setup complete!"
echo "🌐 Your sites are now available at:"
echo "   API: https://demo-api.civic-press.org"
echo "   UI: https://demo.civic-press.org" 