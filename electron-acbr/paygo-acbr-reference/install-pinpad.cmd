@echo off
setlocal
cd /d "%~dp0"
set NODE_EXE=C:\Program Files\nodejs\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

echo Instalacao/ativacao PayGo com pinpad
echo.
echo CNPJ/CPF: 44932369000108
echo Ponto de captura: 111476
echo Ambiente: DEMO
echo Pinpad: COM5
echo.
echo Acompanhe tambem o visor do pinpad se ele pedir confirmacao.
echo.
"%NODE_EXE%" "%~dp0runner.cjs" install --cpf 44932369000108 --pdc 111476 --ambiente DEMO --senha 314159 --pinpad 5
echo.
pause
