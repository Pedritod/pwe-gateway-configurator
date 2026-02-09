# Building Gateway Configurator

This document explains how to build the Gateway Configurator as a portable Windows executable.

## Prerequisites

1. **Node.js** (v18 or higher) - https://nodejs.org/
2. **Git** (optional, for cloning)

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Run in development mode (browser + server)
npm run dev

# Open http://localhost:5173 in browser
```

## Building Portable Windows Executable

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build the Application

```bash
# Build for Windows (creates portable .exe)
npm run electron:build:win
```

The portable executable will be created in the `release` folder:
- `Gateway Configurator-Portable-1.0.0.exe`

### Step 3: Run the Portable App

Simply double-click the `.exe` file. No installation required!

**Note:** The portable app requires Node.js to be installed on the target PC for the server component. For a fully standalone version without Node.js dependency, see "Advanced: Standalone Build" below.

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run in development mode |
| `npm run build` | Build frontend only |
| `npm run electron:dev` | Run Electron in development |
| `npm run electron:build` | Build for current platform |
| `npm run electron:build:win` | Build portable Windows exe |
| `npm run electron:build:mac` | Build macOS dmg |
| `npm run electron:build:linux` | Build Linux AppImage |

## Creating App Icons

Before building, you should create proper icons:

1. Create a 512x512 PNG icon
2. Convert to required formats:
   - `icon.png` - 512x512 PNG (Linux)
   - `icon.ico` - Windows icon (multiple sizes)
   - `icon.icns` - macOS icon

Place all icons in `electron/icons/` folder.

**Online converters:**
- PNG to ICO: https://icoconvert.com/
- PNG to ICNS: https://cloudconvert.com/png-to-icns

## Advanced: Standalone Build (No Node.js Required)

To create a fully standalone executable that doesn't require Node.js:

### Option 1: Using pkg (compile server to exe)

```bash
# Install pkg globally
npm install -g pkg

# Compile server to standalone executable
pkg server/index.js --targets node18-win-x64 --output server.exe

# Copy server.exe to electron/icons folder or resources
# Then build Electron app
npm run electron:build:win
```

### Option 2: Using nexe

```bash
npm install -g nexe
nexe server/index.js -o server.exe
```

## Troubleshooting

### "Node.js not found" error
The portable app requires Node.js to be installed. Either:
1. Install Node.js on the target PC
2. Build a standalone version using `pkg` (see above)

### Server won't start
- Check if port 3001 is already in use
- Check Windows Firewall settings
- Run as Administrator if needed

### UDP Discovery not working
- Ensure the PC is on the same network as the gateways
- Check firewall allows UDP port 1901
- Try disabling VPN if active

## Distribution

To distribute the app:

1. Build the portable exe: `npm run electron:build:win`
2. Find the exe in `release/` folder
3. Share the single `.exe` file

Users can run it directly - no installation needed!
