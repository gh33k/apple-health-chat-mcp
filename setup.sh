#!/bin/bash

echo "🏥 Health Export MCP Server Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"

# Build the project
echo ""
echo "🔨 Building the project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Failed to build project"
    exit 1
fi

echo "✅ Project built successfully"

# Check for health data directory
echo ""
echo "📁 Checking for health data..."

if [ -z "$HEALTH_EXPORT_DIR" ]; then
    echo "⚠️  HEALTH_EXPORT_DIR environment variable not set"
    echo "   Set it to point to your health export CSV files:"
    echo "   export HEALTH_EXPORT_DIR=\"/path/to/your/health/files\""
    echo ""
    echo "   Or the server will scan the current directory for CSV files"
else
    if [ -d "$HEALTH_EXPORT_DIR" ]; then
        CSV_COUNT=$(find "$HEALTH_EXPORT_DIR" -name "HealthMetrics-*.csv" | wc -l)
        echo "✅ Health data directory found: $HEALTH_EXPORT_DIR"
        echo "   Found $CSV_COUNT CSV files"
    else
        echo "⚠️  Health data directory not found: $HEALTH_EXPORT_DIR"
        echo "   Please check the path or create the directory"
    fi
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the server:"
echo "  npm start"
echo ""
echo "To run in development mode:"
echo "  npm run dev"
echo ""
echo "To configure Claude Desktop, copy claude-desktop-config.json.template"
echo "to your Claude Desktop config directory and update the paths."
