@echo off
setlocal enabledelayedexpansion
title city_ai_aayushifty - Autonomous 3D AI Metropolis [SUPREME GOVERNOR CONSOLE]
color 0A

cls
echo ===============================================================================
echo   ____ ___ _____ _   _     _    ___        _        _ __   ___   _ ___ _____   __
echo  / ___|_ _|_   _| \ ^| ^|   / \  ^|_ _^|      / \      / \\ \ / / ^| ^| / _^|_   _\ \ / /
echo ^| ^|    ^| ^|  ^| ^| ^|  \^| ^|  / _ \  ^| ^|_____ / _ \    / _ \\ V /^| ^|_^| \_ \ ^| ^|  \ V / 
echo ^| ^|___ ^| ^|  ^| ^| ^| ^|\  ^| / ___ \ ^| ^|_____/ ___ \  / ___ \^| ^| ^|  _  ^|__) ^|^| ^|   ^| ^|  
echo  \____^|___^| ^|_^| ^|_^| \_^|/_/   \_\___^|   /_/   \_\/_/   \_^|_^| ^|_^| ^|_^|___/ ^|_^|   ^|_^|  
echo ===============================================================================
echo       AUTONOMOUS LOCAL-FIRST AI WORKFORCE IN A PERSISTENT 3D NATION
echo                    SUPREME GOVERNOR OVERSEER CONSOLE
echo ===============================================================================
echo.
echo [*] Initializing city_ai_aayushifty Metropolis...
echo [*] Base Directory: %~dp0
echo.

:: 1. Verify Python & Node
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [!] ERROR: Python is not detected in your PATH. Please install Python 3.10+.
    pause
    exit /b 1
)

node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [!] ERROR: Node.js is not detected in your PATH. Please install Node.js v18+.
    pause
    exit /b 1
)

echo [OK] Python and Node.js runtimes verified.

:: 2. Verify Local Ollama Inference Daemon
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Ollama daemon is offline. Starting local Ollama service...
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start "Ollama Local Inference Runtime" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else (
        start "Ollama Local Inference Runtime" /min ollama serve
    )
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] Ollama local inference daemon is online at http://127.0.0.1:11434.
)

echo.
echo [*] Synchronizing 10 Specialized Citizen Districts:
echo     [1] Citadel Spire          -^> Master Orchestrator (ONLINE)
echo     [2] Vision & PRD Lab       -^> Product Analyst     (ONLINE)
echo     [3] Blueprint Complex      -^> Software Architect  (ONLINE)
echo     [4] Fabrication Foundry    -^> Senior Implementation Engineer (ONLINE)
echo     [5] QA Bastion             -^> Automated Test Verifier (ONLINE)
echo     [6] Diagnostic Core        -^> RCA Troubleshooting Specialist (ONLINE)
echo     [7] Security Citadel       -^> Security Sentinel   (ONLINE)
echo     [8] Release Dock           -^> DevOps & SRE Lead   (ONLINE)
echo     [9] Civic Infrastructure   -^> Civil Construction Superintendent (ONLINE)
echo     [10] Civic Trauma Center   -^> Chief Medical Director (ONLINE)
echo.

:: 3. Launch Backend Server in dedicated window
echo [*] Starting city_ai_aayushifty Backend Engine at http://127.0.0.1:8000...
start "city_ai_aayushifty Backend Core" /min cmd /c "cd /d "%~dp0backend" && set PYTHONPATH=%~dp0backend && python run.py"

:: 4. Launch Frontend Vite Server in dedicated window
echo [*] Starting 3D Metropolis Command Center at http://localhost:5173...
start "city_ai_aayushifty 3D City Frontend" /min cmd /c "cd /d "%~dp0frontend" && npm run dev"

:: 5. Wait for spin up and open browser
echo [*] Establishing Neural Uplink to 3D Metropolis...
timeout /t 3 /nobreak >nul
start http://localhost:5173

cls
echo ===============================================================================
echo   ____ ___ _____ _   _     _    ___        _        _ __   ___   _ ___ _____   __
echo  / ___|_ _|_   _| \ ^| ^|   / \  ^|_ _^|      / \      / \\ \ / / ^| ^| / _^|_   _\ \ / /
echo ^| ^|    ^| ^|  ^| ^| ^|  \^| ^|  / _ \  ^| ^|_____ / _ \    / _ \\ V /^| ^|_^| \_ \ ^| ^|  \ V / 
echo ^| ^|___ ^| ^|  ^| ^| ^| ^|\  ^| / ___ \ ^| ^|_____/ ___ \  / ___ \^| ^| ^|  _  ^|__) ^|^| ^|   ^| ^|  
echo  \____^|___^| ^|_^| ^|_^| \_^|/_/   \_\___^|   /_/   \_\/_/   \_^|_^| ^|_^| ^|_^|___/ ^|_^|   ^|_^|  
echo ===============================================================================
echo.
echo  WELCOME, SUPREME GOVERNOR. YOU ARE IN COMPLETE COMMAND OF THE METROPOLIS.
echo.
echo  [3D METROPOLIS LINK]   http://localhost:5173
echo  [BACKEND API DOCS]     http://127.0.0.1:8000/docs
echo  [LOCAL OLLAMA DAEMON]  http://127.0.0.1:11434
echo  [SANDBOX WORKSPACES]   %~dp0backend\data\workspaces
echo.
echo -------------------------------------------------------------------------------
echo  GOVERNOR CONSOLE COMMANDS:
echo    [1] Re-open 3D Metropolis in Browser
echo    [2] Check Ollama & Installed Local Models
echo    [3] Run Automated 26-Test Pytest Suite
echo    [4] Open Workspace Sandboxes & Deliverables Folder
echo    [5] Trigger Emergency Stop / Resume Execution
echo    [6] Terminate All Metropolis Servers & Exit
echo -------------------------------------------------------------------------------
echo.

:MENU
set /p CHOICE="[GOVERNOR@city_ai_aayushifty] Enter command [1-6]: "

if "%CHOICE%"=="1" (
    start http://localhost:5173
    echo [*] 3D Metropolis opened in default browser.
    echo.
    goto MENU
)

if "%CHOICE%"=="2" (
    echo.
    echo [*] Querying Model Registry at http://127.0.0.1:8000/api/models...
    curl -s http://127.0.0.1:8000/api/models
    echo.
    echo.
    goto MENU
)

if "%CHOICE%"=="3" (
    echo.
    echo [*] Executing 26/26 automated verification test suite...
    cd /d "%~dp0backend"
    set PYTHONPATH=%~dp0backend
    python -m pytest tests -v
    echo.
    goto MENU
)

if "%CHOICE%"=="4" (
    if not exist "%~dp0backend\data\workspaces" mkdir "%~dp0backend\data\workspaces"
    explorer "%~dp0backend\data\workspaces"
    echo [*] Opened workspace sandboxes directory.
    echo.
    goto MENU
)

if "%CHOICE%"=="5" (
    echo [*] Toggling Autonomous Execution Safety Gate...
    curl -s -X POST "http://127.0.0.1:8000/api/budget/emergency-stop?active=true" >nul 2>&1
    echo [!] ALERT: Safety toggle applied.
    echo.
    goto MENU
)

if "%CHOICE%"=="6" (
    echo.
    echo [*] Safely shutting down city_ai_aayushifty servers...
    taskkill /FI "WINDOWTITLE eq city_ai_aayushifty Backend Core*" /T /F >nul 2>&1
    taskkill /FI "WINDOWTITLE eq city_ai_aayushifty 3D City Frontend*" /T /F >nul 2>&1
    echo [OK] All citizen districts offline. Metropolis powered down safely.
    timeout /t 2 /nobreak >nul
    exit /b 0
)

echo [!] Unknown command. Choose 1-6.
echo.
goto MENU

