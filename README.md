# Gateway Configurator

A web application for configuring USR IOT N510 and N720 gateways with energy meters.

## Features

- 🔍 **Auto-discovery** - Scans local network for gateways via UDP
- ⚡ **Energy Meters** - Configure XMC34F, EM4371, Sfere720, EnergyNG9, TAC4300
- 📡 **MQTT Setup** - Configure ThingsBoard or custom MQTT brokers
- 🌐 **Works with both N510 and N720** gateways

---

## 🌐 Web App (Recommended for Development)

Run the app in your browser. Requires Node.js installed.

### Quick Start

```bash
# Clone the repo
git clone https://github.com/Pedritod/pwe-gateway-configurator.git
cd pwe-gateway-configurator/gateway-configurator

# Install dependencies
npm install

# Start the app
npm run dev
```

Open **http://localhost:5173** in your browser.

### What's Running

- **Frontend**: React app on port 5173
- **Backend**: Express server on port 3001 (handles gateway communication)

---

## 🖥️ Windows Portable App

Build a standalone Windows executable that requires NO installation and NO Node.js.

See **[windows/BUILD.md](windows/BUILD.md)** for complete instructions.

### Quick Build (on Windows)

```powershell
cd pwe-gateway-configurator/gateway-configurator
npm install
cd windows
npm install
npm run build
```

Output: `windows/release/Gateway Configurator-1.0.0-Portable.exe` (~100MB)

---

## Project Structure

```
gateway-configurator/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── services/           # API services
│   └── config/             # Meter configurations
├── server/                 # Express backend
│   └── index.js            # API server
├── windows/                # Windows app build
│   ├── electron/           # Electron wrapper
│   └── BUILD.md            # Build instructions
└── package.json
```

---

## Supported Gateways

| Gateway | Model | Features |
|---------|-------|----------|
| N510 | USR-N510 | Basic Modbus gateway |
| N720 | USR-N720 | Edge computing gateway |

## Supported Meters

| Meter | Type | Registers |
|-------|------|-----------|
| XMC34F | 3-Phase | 28 data points |
| EM4371 | Energy | 27 data points |
| Sfere720 | Quality | 40+ data points |
| EnergyNG9 | 9-Channel | 45+ data points |
| TAC4300 | TAC | 36 data points |

---

## Development

```bash
# Run frontend only (no server)
npm run dev:frontend

# Run server only
npm run server

# Run both (recommended)
npm run dev

# Build frontend for production
npm run build
```

---

## License

MIT
