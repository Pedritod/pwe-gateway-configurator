@echo off

echo Gateway Configurator - Local Development
echo ===========================================
echo.

:: Check multiple possible Node.js locations
if exist "C:\Program Files\nodejs\node.exe" (
    echo Found Node.js in C:\Program Files\nodejs
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :start_app
)

if exist "C:\nodejs\node.exe" (
    echo Found Node.js in C:\nodejs
    set "PATH=C:\nodejs;%PATH%"
    goto :start_app
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    echo Found Node.js in %LOCALAPPDATA%\Programs\nodejs
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    goto :start_app
)

if exist "%ProgramFiles%\nodejs\node.exe" (
    echo Found Node.js in %ProgramFiles%\nodejs
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto :start_app
)

:: Check if node is already in PATH
node --version >nul 2>nul
if %ERRORLEVEL% equ 0 goto :start_app

:: Node not found - need to install
echo Node.js not found. Please install it manually:
echo.
echo 1. Download from: https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
echo 2. Run the installer
echo 3. Run this script again
echo.
echo Opening download page...
start https://nodejs.org/en/download/
pause
exit /b 1

:start_app
echo Node version:
node --version
echo npm version:
call npm --version
echo.

:: Install dependencies first (includes TypeScript)
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)
echo.

:: Build the frontend
echo Building frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Failed to build frontend.
    pause
    exit /b 1
)
echo.

:: Start the server
echo Starting server on http://localhost:3001
echo Press Ctrl+C to stop
echo.

node server/index.js
pause
