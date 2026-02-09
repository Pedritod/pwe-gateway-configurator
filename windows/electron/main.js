const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let serverProcess = null;

const SERVER_PORT = 3001;
const isDev = !app.isPackaged;

// Get the correct paths based on whether we're in dev or production
function getResourcesPath() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return process.resourcesPath;
}

function getAppPath() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return path.dirname(app.getPath('exe'));
}

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getServerPath() {
  const resourcesPath = getResourcesPath();
  const appPath = getAppPath();

  console.log('Looking for server...');
  console.log('  resourcesPath:', resourcesPath);
  console.log('  appPath:', appPath);

  // Production: Look for compiled server.exe
  if (!isDev) {
    const serverLocations = [
      path.join(resourcesPath, 'server.exe'),
      path.join(appPath, 'resources', 'server.exe'),
      path.join(appPath, 'server.exe'),
    ];

    for (const loc of serverLocations) {
      console.log('  Checking:', loc);
      if (fs.existsSync(loc)) {
        console.log('  Found server.exe at:', loc);
        return { type: 'executable', path: loc };
      }
    }
  }

  // Development: Use node to run server
  const devServerPath = path.join(__dirname, '..', '..', 'server', 'index.js');
  console.log('  Dev server path:', devServerPath);
  if (fs.existsSync(devServerPath)) {
    return { type: 'node', path: devServerPath };
  }

  console.error('Server not found!');
  return null;
}

function getDistPath() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'dist');
  }

  // Production: dist is in resources/app
  const paths = [
    path.join(getResourcesPath(), 'app'),
    path.join(getAppPath(), 'resources', 'app'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return path.join(getResourcesPath(), 'app');
}

function getIconPath(name) {
  const iconName = name || (process.platform === 'win32' ? 'icon.ico' : 'icon.png');

  const paths = isDev
    ? [path.join(__dirname, 'icons', iconName)]
    : [
        path.join(getResourcesPath(), 'icons', iconName),
        path.join(getResourcesPath(), iconName),
        path.join(getAppPath(), 'resources', 'icons', iconName),
        path.join(__dirname, 'icons', iconName),
      ];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function createWindow() {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Gateway Configurator',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // Remove menu bar completely
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Wait for server then load
  const startUrl = `http://localhost:${SERVER_PORT}`;

  waitForServer(startUrl, 45000)
    .then(() => {
      console.log('Server ready, loading app...');
      mainWindow.loadURL(startUrl);
    })
    .catch((err) => {
      console.error('Failed to connect to server:', err);
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
    });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray on close
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

function waitForServer(url, timeout) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
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

      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() - startTime >= timeout) {
          reject(new Error('Server timeout'));
        } else {
          setTimeout(check, 500);
        }
      });
    };

    // Give server a moment to start
    setTimeout(check, 1000);
  });
}

function startServer() {
  const serverInfo = getServerPath();

  if (!serverInfo) {
    console.error('Server not found!');
    return;
  }

  console.log(`Starting server (${serverInfo.type}):`, serverInfo.path);

  const distPath = getDistPath();
  console.log('Static files path:', distPath);

  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    NODE_ENV: 'production',
    DIST_PATH: distPath,
  };

  if (serverInfo.type === 'executable') {
    // Run compiled server.exe (standalone, no Node.js needed)
    serverProcess = spawn(serverInfo.path, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      cwd: path.dirname(serverInfo.path),
    });
  } else {
    // Development: Run with Node.js
    serverProcess = spawn('node', [serverInfo.path], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    if (!app.isQuitting && code !== 0) {
      console.log('Server crashed, restarting in 3 seconds...');
      setTimeout(startServer, 3000);
    }
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');

    if (process.platform === 'win32') {
      // Force kill on Windows including child processes
      try {
        spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t'], {
          windowsHide: true,
        });
      } catch (e) {
        serverProcess.kill('SIGKILL');
      }
    } else {
      serverProcess.kill('SIGTERM');
    }

    serverProcess = null;
  }
}

function createTray() {
  let trayIcon;
  const iconPath = getIconPath('icon.png') || getIconPath('icon.ico');

  if (iconPath && fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } else {
    // Fallback: simple blue icon
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAELSURBVDiNpZMxTsNAEEXfbGyUgoKOgoIL0HEGLkBBwQG4BEfgEnRQUFBQICpAQlgmG4qVNztrx0n4kmXtaufPn/l7RhVJLOk28AisgTPgBHgAboE7ks4H8bsJ8rlxAXwCnwMvgB3graqun4GrAl8Au8BcEgfABPgAjoFT4C1LVvcjYL8F9gYwH/gCjluAlwJ/AL4K/BC4KfAzsN8CfAI2UQ7YB+oC14FHDb4DvAL7QNlhtQQ4LPAd4FkS4zg2AGbAIXCU4qbAbgnuNPG7AHfAAnglIkJSVVVTSaQQWwMnEbGKiLEkRcSxpCVwDnxnJQETSW8pIiJVVckWWE+S2gDnwLmk+sAi/kqkP/0AbnBRVJr2a8sAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Gateway Configurator');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Gateway Configurator',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Restart Server',
      click: () => {
        stopServer();
        setTimeout(startServer, 1000);
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
  console.log('=== Gateway Configurator Starting ===');
  console.log('Is packaged:', app.isPackaged);
  console.log('Resources path:', getResourcesPath());
  console.log('App path:', getAppPath());
  console.log('Dist path:', getDistPath());

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
  // Keep running in tray - don't quit
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

app.on('quit', () => {
  stopServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
