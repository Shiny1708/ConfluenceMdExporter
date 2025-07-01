#!/bin/bash

echo "🧪 Testing Confluence Markdown Exporter Conversion Features"

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if test file exists
if [ ! -f "tests/samples/test-sample.html" ]; then
    echo "❌ tests/samples/test-sample.html not found."
    exit 1
fi

echo ""
echo "1️⃣ Testing basic HTML conversion..."
npm start convert-html -- --input tests/samples/test-sample.html --title "Basic Test" --output tests/outputs/test-basic.md

echo ""
echo "2️⃣ Testing advanced conversion with custom options..."
npm start convert-advanced -- \
    --input tests/samples/test-sample.html \
    --title "Advanced Test" \
    --bullet-marker "*" \
    --fence "~~~" \
    --heading-style "atx" \
    --output tests/outputs/test-advanced.md

echo ""
echo "3️⃣ Testing image-rich conversion..."
if [ -f "tests/samples/test-images.html" ]; then
    npm start convert-html -- --input tests/samples/test-images.html --title "Image Test" --output tests/outputs/test-images.md
fi

echo ""
echo "4️⃣ Testing preview mode..."
npm start convert-advanced -- \
    --input tests/samples/test-sample.html \
    --title "Preview Test" \
    --bullet-marker "+" \
    --preview

echo ""
echo "✅ All tests completed!"
echo ""
echo "Generated files:"
ls -la tests/outputs/*.md 2>/dev/null || echo "No markdown files found in tests/outputs/"

echo ""
echo "🔍 You can examine the generated files to see the differences in conversion styles."
