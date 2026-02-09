# Building Gateway Configurator - Windows Portable App

This document explains how to build a **fully standalone** Windows portable executable that requires **NO Node.js installation** on the target PC.

---

## 🚀 Quick Build (Copy & Paste on Windows)

Open **PowerShell** or **Command Prompt** on a Windows PC and run:

```powershell
# Clone the repo (first time only)
git clone https://github.com/Pedritod/pwe-gateway-configurator.git

# Navigate to project
cd pwe-gateway-configurator/gateway-configurator

# Install main dependencies
npm install

# Navigate to windows folder and build
cd windows
npm install
npm run build
```

**Output:** `windows/release/Gateway Configurator-1.0.0-Portable.exe` (~100MB)

---

## 📦 After Code Changes - Rebuild

Every time you make changes to the app, rebuild with:

```powershell
# From the gateway-configurator folder
git pull                    # Get latest changes
npm install                 # Update dependencies if needed

cd windows
npm run build               # Rebuild the exe
```

The new exe will be in `windows/release/`

---

## Prerequisites (Build Machine Only)

1. **Windows PC** - Required for building Windows executables
2. **Node.js v18+** - Download from https://nodejs.org/
3. **Git** - Download from https://git-scm.com/

---

## What the Build Does

1. **Builds frontend** - Compiles React app to `dist/`
2. **Compiles server** - Uses `pkg` to bundle Node.js + server into `server.exe`
3. **Packages Electron** - Creates portable exe with everything bundled

The final exe includes:
- Electron (Chromium browser) ~60MB
- Compiled server.exe (Node.js runtime) ~30MB
- Frontend assets ~2MB
- **Total: ~100MB**

---

## Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm run build` | **Full build** (frontend + server + electron) |
| `npm run build:frontend` | Build React frontend only |
| `npm run build:server` | Compile server to standalone exe |
| `npm run build:electron` | Package Electron app |

---

## Output Files

After successful build:

```
windows/
├── dist/
│   └── server.exe                              # Standalone server
└── release/
    └── Gateway Configurator-1.0.0-Portable.exe # Final app (~100MB)
```

---

## Running the Portable App

1. Copy `Gateway Configurator-1.0.0-Portable.exe` to any Windows PC
2. Double-click to run
3. ✅ **No installation required!**
4. ✅ **No Node.js required!**

The app will:
- Start a background server for gateway communication
- Open the configurator window
- Add a system tray icon (minimize to tray)

---

## App Icons (Optional)

Before building for distribution, you can add custom icons:

1. Create a 512x512 PNG icon
2. Convert to ICO at https://icoconvert.com/
3. Place `icon.png` and `icon.ico` in `windows/electron/icons/`

An SVG template is provided at `electron/icons/icon.svg`

---

## Troubleshooting

### Build fails
```powershell
npm cache clean --force
rm -rf node_modules
npm install
npm run build
```

### App won't start
- Run as Administrator
- Check if port 3001 is in use
- Check Windows Defender isn't blocking

### Gateway discovery not working
- Ensure PC is on same network as gateways
- Check firewall allows UDP port 1901
- Disable VPN if active

---

## Development Mode (No Build Needed)

For quick testing without building the exe:

```powershell
# Terminal 1 - From gateway-configurator folder
npm run dev

# Opens at http://localhost:5173
```

---

## Distribution

1. Build: `npm run build`
2. Find: `windows/release/Gateway Configurator-1.0.0-Portable.exe`
3. Share the single `.exe` file

Users just double-click to run - nothing else needed!
