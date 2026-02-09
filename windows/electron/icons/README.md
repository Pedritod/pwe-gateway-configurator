# App Icons

To build the Electron app, you need to provide icons in the following formats:

## Required Files

1. **icon.png** - 512x512 PNG (for Linux and as source)
2. **icon.ico** - Windows icon (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
3. **icon.icns** - macOS icon (optional, for Mac builds)

## How to Create Icons

### Option 1: Online Converter
1. Open `icon.svg` in a browser
2. Take a screenshot or use an online SVG to PNG converter
3. Use https://icoconvert.com/ to convert PNG to ICO
4. Use https://cloudconvert.com/png-to-icns for ICNS (Mac)

### Option 2: Using ImageMagick (if installed)
```bash
# Convert SVG to PNG
convert -background none icon.svg -resize 512x512 icon.png

# Create ICO with multiple sizes
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Create ICNS (Mac)
iconutil -c icns icon.iconset
```

### Option 3: Using electron-icon-builder
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=icon.png --output=./
```

## Temporary Workaround

If you don't have icons ready, the app will build with default Electron icons.
You can add proper icons later and rebuild.
