# Building Gateway Configurator - Windows Portable App

This document explains how to build a **fully standalone** Windows portable executable that requires **NO Node.js installation** on the target PC.

## Prerequisites (Build Machine Only)

1. **Node.js** v18 or higher - https://nodejs.org/
2. **Windows** (for building Windows executables) or cross-compilation setup

## Quick Build (One Command)

```bash
cd windows
npm install
npm run build
```

This will:
1. Build the frontend (React app)
2. Compile the server into a standalone `server.exe` using `pkg`
3. Package everything into a portable Electron app

Output: `windows/release/Gateway Configurator-1.0.0-Portable.exe`

## Step-by-Step Build

### Step 1: Install Dependencies

```bash
# From the project root
cd gateway-configurator

# Install main project dependencies
npm install

# Install Windows app dependencies
cd windows
npm install
```

### Step 2: Build Frontend

```bash
# From windows folder
npm run build:frontend
```

This builds the React frontend to `../dist/`

### Step 3: Compile Server to Standalone EXE

```bash
npm run build:server
```

This uses `pkg` to compile the Node.js server into a standalone `server.exe` that includes:
- Node.js runtime
- All server dependencies
- No external Node.js installation needed!

Output: `windows/dist/server.exe`

### Step 4: Build Electron App

```bash
npm run build:electron
```

This packages everything into a portable Windows executable.

Output: `windows/release/Gateway Configurator-1.0.0-Portable.exe`

## Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Full build (frontend + server + electron) |
| `npm run build:frontend` | Build React frontend only |
| `npm run build:server` | Compile server to standalone exe |
| `npm run build:electron` | Package Electron app |
| `npm run build:dir` | Build unpacked (for debugging) |
| `npm run dev` | Run Electron in development mode |

## App Icons

Before building for distribution, create proper icons:

1. Create a 512x512 PNG icon
2. Convert to required formats:
   - `icon.png` - 512x512 PNG
   - `icon.ico` - Windows icon (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)

3. Place icons in `windows/electron/icons/` folder

**Online converters:**
- PNG to ICO: https://icoconvert.com/
- SVG to PNG: https://svgtopng.com/

An SVG template is provided at `electron/icons/icon.svg`

## Output Files

After successful build:

```
windows/
├── dist/
│   └── server.exe          # Standalone server (compiled with pkg)
└── release/
    └── Gateway Configurator-1.0.0-Portable.exe  # Final portable app (~100MB)
```

## Running the Portable App

1. Copy `Gateway Configurator-1.0.0-Portable.exe` to any Windows PC
2. Double-click to run
3. **No installation required!**
4. **No Node.js required!**

The app will:
- Start a background server for gateway communication
- Open the configurator window
- Add a system tray icon (minimize to tray)

## Features

- **Portable**: Single exe file, no installation
- **Standalone**: No Node.js or other dependencies needed
- **System Tray**: Runs in background, accessible from tray
- **Auto-restart**: Server automatically restarts if it crashes
- **UDP Discovery**: Scans local network for gateways

## Troubleshooting

### App won't start
- Try running as Administrator
- Check if port 3001 is already in use
- Check Windows Defender/antivirus isn't blocking

### Server won't start
- Check Windows Firewall allows the app
- Port 3001 might be in use by another application

### Gateway discovery not working
- Ensure PC is on the same network as gateways
- Check firewall allows UDP port 1901
- Disable VPN if active

### Build fails with pkg
- Ensure Node.js v18+ is installed
- Try: `npm cache clean --force && npm install`

## Development Mode

For development without building:

```bash
# Terminal 1: Start the server
cd gateway-configurator
npm run server

# Terminal 2: Start frontend
npm run dev

# Open http://localhost:5173
```

Or run Electron in dev mode:

```bash
cd windows
npm run dev
```

## Distribution

To distribute the app:

1. Build: `npm run build`
2. Find: `windows/release/Gateway Configurator-1.0.0-Portable.exe`
3. Share the single `.exe` file

Users just double-click to run - nothing else needed!
