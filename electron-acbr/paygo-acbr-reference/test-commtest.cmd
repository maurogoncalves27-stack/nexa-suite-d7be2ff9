@echo off
setlocal
cd /d "%~dp0"
set NODE_EXE=C:\Program Files\nodejs\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

echo Teste real de comunicacao PayGo/PGWebLib
echo.
echo Este teste chama o runner fora do sandbox do Codex.
echo Se falhar aqui, a falha e da configuracao PayGo/pinpad/DLL, nao da tela.
echo.
"%NODE_EXE%" "%~dp0runner.cjs" commtest
echo.
pause
