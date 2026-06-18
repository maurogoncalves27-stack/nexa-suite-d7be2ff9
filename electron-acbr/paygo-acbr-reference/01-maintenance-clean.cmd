@echo off
setlocal
cd /d "%~dp0"
set NODE_EXE=C:\Program Files\nodejs\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

echo 1. Manutencao / limpeza PayGo
echo.
echo Primeiro sera executada a manutencao PayGo (PWOPER_MAINTENANCE).
echo Depois sera feita a limpeza de pendencias da DLL.
echo.
"%NODE_EXE%" "%~dp0runner.cjs" maintenance
echo.
echo Limpando pendencias...
"%NODE_EXE%" "%~dp0runner.cjs" cleanup
echo.
pause
