const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, fork } = require('child_process');
const fs = require('fs');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let serverProcess = null;

const SERVER_PORT = 3001;
const isDev = !app.isPackaged;

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getServerPath() {
  if (isDev) {
    // Development: server source in project
    return {
      type: 'node',
      path: path.join(__dirname, '..', 'server', 'index.js')
    };
  }

  // Production: Look for bundled server executable or script
  const resourcesPath = process.resourcesPath;
  const appPath = path.dirname(app.getPath('exe'));

  // Check for compiled server executable (from pkg)
  const serverExeNames = process.platform === 'win32'
    ? ['server.exe', 'server-win.exe']
    : ['server', 'server-linux', 'server-macos'];

  for (const exeName of serverExeNames) {
    const exePath = path.join(resourcesPath, exeName);
    if (fs.existsSync(exePath)) {
      return { type: 'executable', path: exePath };
    }
    const appExePath = path.join(appPath, exeName);
    if (fs.existsSync(appExePath)) {
      return { type: 'executable', path: appExePath };
    }
  }

  // Fall back to node script (requires Node.js installed)
  const serverScript = path.join(resourcesPath, 'server', 'index.js');
  if (fs.existsSync(serverScript)) {
    return { type: 'node', path: serverScript };
  }

  // Try app directory
  const appServerScript = path.join(appPath, 'resources', 'server', 'index.js');
  if (fs.existsSync(appServerScript)) {
    return { type: 'node', path: appServerScript };
  }

  console.error('Could not find server!');
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Gateway Configurator',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  const startUrl = `http://localhost:${SERVER_PORT}`;

  // Wait for server to be ready before loading
  waitForServer(startUrl, 30000)
    .then(() => {
      mainWindow.loadURL(startUrl);
    })
    .catch((err) => {
      console.error('Failed to connect to server:', err);
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
    });

  // Handle window close - minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';

  if (isDev) {
    return path.join(__dirname, 'icons', iconName);
  }

  // Production paths
  const paths = [
    path.join(process.resourcesPath, 'icons', iconName),
    path.join(process.resourcesPath, iconName),
    path.join(__dirname, 'icons', iconName),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function waitForServer(url, timeout) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const http = require('http');

      const req = http.get(url, (res) => {
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - startTime >= timeout) {
          reject(new Error('Server timeout'));
        } else {
          setTimeout(check, 500);
        }
      });

      req.setTimeout(1000, () => {
        req.destroy();
        if (Date.now() - startTime >= timeout) {
          reject(new Error('Server timeout'));
        } else {
          setTimeout(check, 500);
        }
      });
    };

    check();
  });
}

function startServer() {
  const serverInfo = getServerPath();

  if (!serverInfo) {
    console.error('Server not found!');
    return;
  }

  console.log(`Starting server (${serverInfo.type}):`, serverInfo.path);

  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    NODE_ENV: isDev ? 'development' : 'production',
  };

  if (serverInfo.type === 'executable') {
    // Run compiled server executable
    serverProcess = spawn(serverInfo.path, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    // Run with Node.js
    const nodePath = process.platform === 'win32' ? 'node.exe' : 'node';

    serverProcess = spawn(nodePath, [serverInfo.path], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (!app.isQuitting && code !== 0) {
      // Restart server if it crashes (but not if it was intentionally stopped)
      console.log('Server crashed, restarting in 2 seconds...');
      setTimeout(startServer, 2000);
    }
  });
}

function stopServer() {
  if (serverProcess) {
    if (process.platform === 'win32') {
      // On Windows, use taskkill to ensure child processes are killed
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { windowsHide: true });
    } else {
      serverProcess.kill('SIGTERM');
    }
    serverProcess = null;
  }
}

function createTray() {
  const iconPath = getIconPath();
  let trayIcon;

  if (iconPath && fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    // Resize for tray (16x16 on Windows, 22x22 on macOS)
    const size = process.platform === 'darwin' ? 22 : 16;
    trayIcon = trayIcon.resize({ width: size, height: size });
  } else {
    // Create a simple fallback icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAKhSURBVFiF7ZdNaBNBFMd/s5vdZJOmSWxjm9qqCEVBEEUPggcPnj14E/RWwYsgeBAv4kEQRPDgRfDgRRAvIogHQfCiB0ERpFQtWqu2tk1jk+wmye5mxsOmMUm7bZp+HHzwYGdn5//mb2Z23iwoFAqF4n9GOSvjvGNcb1jT95u21X5aybZs3O+cGQBWTnzdbdkOY3ZQ36sPRMYmBqKRF8lMepNhORGHR8cclMPnz7ZKh68kUxn/o9RJ+8iB7kZ75F4ymfZeaOpPT6e8R/UBX37VNV8gYlWD3hOvZjXl2mBL8E7eP9E3HJ4eF+Wn9kz0OHx9ozEe2jIUDQT7Ey5P4s0tWzjZBGwRAIBlOzQ6ozRHDTwuD3tMD7/8TFJ/p7pBT3KqSPYBwKYuD4BTwVYKhBYCiEqgKNVPfJhJ5nPAL4Ri0xP2BIArAdj1n8u1lxdrLrkXCvzKBz4FLgPt/EWiC45dNAe/BG8CuYjKpG8BTQFfAZqAd+B54C7wLXAJe1LpfLbgL2AS8AD4DCoFPgJuASeAG8LZWfQA4DZwCvgFBYBG4DFwBfACuAWWg9ALgRAPgDiABJ4FHwGtgAngEvAbOAE8Bo1b/AngIHAb8wBRwH3gDjAJ3gWeAp5YPvAUuAweBKDAL3ANeA6eAR8DjWnQcuAQ4gdnCd4PvgKfAbeABoFcKuA4cqRkYAx4Cd4BeYBJ4U6v+AFwFXgEXgPM16wnQC/QDI8A9YALYB/QBz4F7wEPgYKUAaA2MAvuBFsWcXuAZ8LhW7QN2A7uBO8BjYDfQDzytWT8EngAbK2VX8hC+Bw4DbYrd94FnwA6gG7gDPAe2A13AbeAFsK0eUO8bASAJbAE6gSlgGNgABEQVR9f3fQ1W+BPd+EzRz8aPYAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Gateway Configurator');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Restart Server',
      click: () => {
        stopServer();
        setTimeout(startServer, 500);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  startServer();
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep in tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

app.on('quit', () => {
  stopServer();
});
