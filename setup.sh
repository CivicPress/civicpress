#!/bin/bash
echo "🔧 Setting up CivicPress dev environment..."

# Check for Node
if ! command -v node &> /dev/null
then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit
fi

# Install pnpm if missing
if ! command -v pnpm &> /dev/null
then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "📁 Installing dependencies..."
pnpm install

echo "✅ CivicPress environment is ready!"
