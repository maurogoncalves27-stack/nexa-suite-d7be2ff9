@echo off
setlocal
cd /d "%~dp0"
set PAYGO_REF_UI_PORT=3111
set NODE_EXE=C:\Program Files\nodejs\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

echo Iniciando Painel PayGo ACBr Reference...
echo URL: http://localhost:%PAYGO_REF_UI_PORT%
echo.
echo Abrindo servidor em uma nova janela...
start "PayGo ACBr Reference Server" cmd /k ""%NODE_EXE%" "%~dp0ui-server.cjs" --port=%PAYGO_REF_UI_PORT%"

echo Aguardando servidor responder...
for /L %%i in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:%PAYGO_REF_UI_PORT%/api/status' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo.
echo Nao consegui abrir o servidor na porta %PAYGO_REF_UI_PORT%.
echo Veja a janela "PayGo ACBr Reference Server" para o erro.
pause
exit /b 1

:ready
echo Servidor pronto.
start "" "http://localhost:%PAYGO_REF_UI_PORT%"
exit /b 0
