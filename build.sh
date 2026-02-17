#!/bin/bash

# Build script with JavaScript validation
# Usage: ./build.sh

set -e

echo "[1/2] Checking JavaScript syntax..."
./check-js-syntax.sh

echo ""
echo "[2/2] Building Go binary..."
go build -o harvesterNavigator

echo ""
echo "Build completed. Run with: ./harvesterNavigator"
