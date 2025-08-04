#!/bin/bash

# CivicPress Service Startup Script
# Run this after the setup is complete

echo "🚀 Starting CivicPress services..."

cd /home/ubuntu/civicpress

# Start the API
echo "📡 Starting API server..."
pm2 start modules/api/src/index.ts --name civicpress-api --interpreter tsx

# Start the UI
echo "🖥️ Starting UI server..."
pm2 start modules/ui/.output/server/index.mjs --name civicpress-ui

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Set PM2 to start on boot
echo "🔧 Setting PM2 to start on boot..."
pm2 startup

echo "✅ Services started!"
echo "📊 Check status with: pm2 status"
echo "📋 View logs with: pm2 logs"
echo "🔄 Restart with: pm2 restart all" 