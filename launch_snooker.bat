@echo off
setlocal
set TITLE_COLOR=0B
set RESET=07

title Snooker App Launcher

:: Change to the root directory where the .bat file is located
cd /d "%~dp0"

echo ==========================================
echo       SNOOKER LIVE - APP LAUNCHER
echo ==========================================
echo.

:: Check for node_modules in server
if not exist "snooker-server\node_modules\" (
    echo [!] Server dependencies missing. Running npm install...
    start /wait "Installing Server Deps" cmd /c "cd snooker-server && npm install"
)

:: Check for node_modules in client
if not exist "snooker-client\node_modules\" (
    echo [!] Client dependencies missing. Running npm install...
    start /wait "Installing Client Deps" cmd /c "cd snooker-client && npm install"
)

:: Start Server in a separate window
echo [+] Starting Server in a new window...
start "Snooker Server" cmd /k "cd snooker-server && node server.js"

:: Give it a second
timeout /t 2 /nobreak > nul

:: Start Client in a separate window
echo [+] Starting Client in a new window...
start "Snooker Client" cmd /k "cd snooker-client && npm run dev"

echo.
echo ------------------------------------------
echo [OK] Both server and client are starting.
echo      You can close this launcher window.
echo ------------------------------------------
echo.

pause
exit /b
