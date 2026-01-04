@echo off
echo ===========================================
echo   GAME VAULT LAUNCHER
echo ===========================================
echo.
echo [1/3] Parando servidores antigos...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5500" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo [2/3] Iniciando Smart Server...
echo.
echo  Acesse em: http://localhost:5500
echo.
python server.py
pause
