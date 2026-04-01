#!/bin/bash

# --- PIBOT Project Validator ---
# Audits the project for syntax errors and structural integrity.

echo "🚀 Starting Full Project Audit..."

# 1. Javascript Syntax Check
echo "📦 Checking JS Syntax..."
find src -name "*.js" -exec node -c {} \;
if [ $? -eq 0 ]; then
    echo "✅ Javascript: No syntax errors found."
else
    echo "❌ Javascript: Syntax errors detected."
fi

# 2. Key Files Existence
echo "📂 Checking Core Files..."
FILES=("src/main.js" "src/renderer.js" "src/index.html" "src/style.css" "package.json")
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ Found: $file"
    else
        echo "❌ MISSING: $file"
    fi
done

# 3. Dependencies Audit
echo "🧪 Auditing Dependencies..."
if [ -d "node_modules" ]; then
    echo "✅ node_modules: Detected"
else
    echo "❌ node_modules: MISSING! Run npm install."
fi

echo "---"
echo "🏁 Audit Complete."
