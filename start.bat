@echo off
setlocal
cd /d "%~dp0"
title schema-forge dev

set "OPEN_FLAG=--open"
if /i "%~1"=="--no-open" set "OPEN_FLAG="

echo.
echo ==========================================
echo   schema-forge - one-click dev launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto :old_node

set "PNPM_CMD=pnpm"
where pnpm >nul 2>nul
if not errorlevel 1 goto :deps

where corepack >nul 2>nul
if errorlevel 1 goto :no_pnpm
echo [setup] pnpm not found; falling back to corepack pnpm.
set "PNPM_CMD=corepack pnpm"

:deps
if not exist "node_modules\.pnpm" goto :install
if not exist "node_modules\.bin\vite.cmd" goto :install
goto :start

:install
echo [setup] Installing dependencies. This can take a minute...
call %PNPM_CMD% install
if errorlevel 1 goto :install_failed

:start
echo [dev] Starting Vite. The actual local URL is printed below.
echo [dev] Designer route: append #/designer to that URL.
echo [dev] Press Ctrl+C to stop.
echo.
call %PNPM_CMD% dev %OPEN_FLAG%
if errorlevel 1 goto :dev_failed
exit /b 0

:no_node
echo [ERROR] Node.js was not found.
echo         Install Node.js 20 or newer: https://nodejs.org/
goto :fail

:old_node
echo [ERROR] Node.js 20 or newer is required.
echo         Current version:
node -v
goto :fail

:no_pnpm
echo [ERROR] pnpm was not found.
echo         Install it with: npm install -g pnpm
goto :fail

:install_failed
echo [ERROR] Dependency installation failed.
echo         Check your network and run pnpm install manually.
goto :fail

:dev_failed
echo [ERROR] Dev server exited unexpectedly.
goto :fail

:fail
echo.
pause
exit /b 1
