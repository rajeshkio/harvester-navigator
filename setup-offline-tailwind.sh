#!/bin/bash

# Harvester Navigator - Tailwind Offline Setup Script
# This script sets up Tailwind CSS for offline use

set -e

echo "🚀 Setting up Tailwind CSS for offline use..."
echo ""

PROJECT_DIR="/Users/rajeshkumar/mcp-workspace/harvesterNavigator"

# Check if we're in the right directory
if [ ! -f "$PROJECT_DIR/index.html" ]; then
    echo "❌ Error: Not in harvesterNavigator directory"
    echo "   Please run this script from: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

echo "📋 Step 1: Installing Tailwind CSS..."
npm install -D tailwindcss@3.4.1

echo ""
echo "📋 Step 2: Files already copied (tailwind.config.js, input.css, package.json)"

echo ""
echo "📋 Step 3: Building Tailwind CSS..."
npm run build:css

echo ""
echo "📋 Step 4: Checking if styles/tailwind.css was created..."
if [ -f "styles/tailwind.css" ]; then
    SIZE=$(du -h styles/tailwind.css | cut -f1)
    echo "✅ Generated styles/tailwind.css (Size: $SIZE)"
else
    echo "❌ Failed to generate styles/tailwind.css"
    exit 1
fi

echo ""
echo "📋 Step 5: Update index.html to use local CSS..."
echo "   You need to manually change the <link> tag in index.html:"
echo "   FROM: <link href=\"https://cdn.tailwindcss.com/...\" rel=\"stylesheet\">"
echo "   TO:   <link href=\"styles/tailwind.css\" rel=\"stylesheet\">"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Update index.html to use local CSS (see above)"
echo "   2. Rebuild Go binary: go build"
echo "   3. Test without internet connection"
echo ""
echo "💡 Development tip:"
echo "   Use 'npm run watch:css' to auto-rebuild CSS during development"
