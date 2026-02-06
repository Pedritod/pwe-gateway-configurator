#!/bin/bash

# Gateway Configurator - Start Script (without Docker)
# This script builds and runs the application locally

set -e

echo "🔧 Gateway Configurator - Local Development"
echo "==========================================="

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "📦 Node version: $(node --version)"
echo "📦 npm version: $(npm --version)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📥 Installing dependencies..."
    npm install
fi

# Build the frontend
echo ""
echo "🏗️  Building frontend..."
npm run build

# Start the server
echo ""
echo "🚀 Starting server on http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""

node server/index.js
