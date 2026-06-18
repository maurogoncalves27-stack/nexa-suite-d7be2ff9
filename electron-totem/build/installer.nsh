!macro customInstall
  DetailPrint "Instalando RustDesk (acesso remoto de suporte)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\install-rustdesk.ps1"'
  Pop $0
  DetailPrint "RustDesk setup exit code: $0"
!macroend
