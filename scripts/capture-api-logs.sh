#!/bin/bash
# Capture API Server Initialization Logs
# 
# This script runs the API server and captures all logs to a file
# so you can see the complete initialization process

LOG_FILE="api-init-$(date +%Y%m%d-%H%M%S).log"

echo "📝 Starting API server with full log capture..."
echo "📄 Logs will be saved to: $LOG_FILE"
echo "🛑 Press Ctrl+C to stop"
echo ""

cd modules/api

# Run with tee to both display and save logs
pnpm run dev 2>&1 | tee "../../$LOG_FILE"

