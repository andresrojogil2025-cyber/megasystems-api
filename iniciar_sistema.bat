@echo off
title Sistema Megasystems - Iniciando...
echo ==========================================
echo    INICIANDO SISTEMA MEGASYSTEMS
echo ==========================================
echo.
echo 1. Iniciando servidor backend...
cd backend
start /b node server.js
echo.
echo 2. Esperando a que el servidor este listo...
timeout /t 3 /nobreak > nul
echo.
echo 3. Abriendo el sistema en el navegador...
start "" "..\frontend\index.html"
echo.
echo ==========================================
echo    SISTEMA INICIADO EXITOSAMENTE
echo ==========================================
exit
