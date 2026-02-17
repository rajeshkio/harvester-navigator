#!/bin/bash

# JavaScript Syntax Checker for Harvester Navigator
# Checks all JS files for syntax errors

JS_FILES=$(find js -name "*.js" -type f)
ERRORS=0
CHECKED=0

for file in $JS_FILES; do
    CHECKED=$((CHECKED + 1))
    if node --check "$file" 2>&1; then
        echo "OK: $file"
    else
        echo "FAIL: $file"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "Checked: $CHECKED files"

if [ $ERRORS -eq 0 ]; then
    echo "All JavaScript files are valid."
    exit 0
else
    echo "Found $ERRORS file(s) with syntax errors."
    exit 1
fi
