@echo off
setlocal
cd /d "%~dp0"
set NODE_EXE=C:\Program Files\nodejs\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

echo 2. Configuracao PayGo no pinpad
echo.
echo Executando PWOPER_CONFIG, igual a operacao de configuracao da demo.
echo.
"%NODE_EXE%" "%~dp0runner.cjs" config
echo.
pause
