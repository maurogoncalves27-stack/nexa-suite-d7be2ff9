@echo off
title NEXA ACBr Agent (Console)
cd /d "%~dp0"
echo.
echo  NEXA ACBr Agent - modo console
echo  HTTP  http://127.0.0.1:3030
echo  HTTPS https://127.0.0.1:3031
echo.
echo  Mantenha esta janela aberta enquanto usar o TEF.
echo.
npm run start:console
if errorlevel 1 (
  echo.
  echo  Agente encerrou com erro.
  pause
)
