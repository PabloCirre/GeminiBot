#!/bin/bash
# PIBOT Native Icon Generator for macOS

if [ ! -f "assets/icon.png" ]; then
    echo "❌ Error: assets/icon.png not found."
    exit 1
fi

echo "🚀 Generating high-resolution iconset..."

# Create a temporary iconset folder
mkdir -p build/icon.iconset

# Standard sizes for macOS
sips -z 16 16     assets/icon.png --out build/icon.iconset/icon_16x16.png -s format png
sips -z 32 32     assets/icon.png --out build/icon.iconset/icon_16x16@2x.png -s format png
sips -z 32 32     assets/icon.png --out build/icon.iconset/icon_32x32.png -s format png
sips -z 64 64     assets/icon.png --out build/icon.iconset/icon_32x32@2x.png -s format png
sips -z 128 128   assets/icon.png --out build/icon.iconset/icon_128x128.png -s format png
sips -z 256 256   assets/icon.png --out build/icon.iconset/icon_128x128@2x.png -s format png
sips -z 256 256   assets/icon.png --out build/icon.iconset/icon_256x256.png -s format png
sips -z 512 512   assets/icon.png --out build/icon.iconset/icon_256x256@2x.png -s format png
sips -z 512 512   assets/icon.png --out build/icon.iconset/icon_512x512.png -s format png
cp assets/icon.png build/icon.iconset/icon_512x512@2x.png

# Create the .icns file
iconutil -c icns build/icon.iconset -o build/icon.icns

# Clean up
rm -rf build/icon.iconset

echo "✅ Success: build/icon.icns created."
