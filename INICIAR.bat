@echo off
REM ============================================================
REM  Maria Castagno - Sistema de gestion
REM  Doble clic para instalar (la primera vez) y abrir el sistema.
REM  Requiere Node.js 22 o superior (https://nodejs.org).
REM ============================================================
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta instalar Node.js: https://nodejs.org & pause & exit /b 1)
echo Instalando / actualizando componentes...
call npm install --no-audit --no-fund || (pause & exit /b 1)
echo Preparando la base de datos (con copia de seguridad antes)...
call npm run db:setup || (pause & exit /b 1)
echo Compilando (la primera vez tarda unos minutos)...
call npm run build || (pause & exit /b 1)
echo.
echo  Listo. En esta PC:  http://localhost:3100
echo  Desde el celular o la tablet (misma red wifi): http://IP-DE-ESTA-PC:3100
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo     posible direccion: http:%%a:3100
echo  No cierres esta ventana mientras uses el sistema.
echo.
start "" http://localhost:3100
call npx next start -p 3100 -H 0.0.0.0
pause
