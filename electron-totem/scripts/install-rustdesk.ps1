# Instala RustDesk no totem (acesso remoto de suporte).
# Chamado pelo instalador NSIS do Nexa Totem ou manualmente em PowerShell (admin).
param(
  [string] $ConfigDir = "$env:ProgramData\ViteSuite",
  [string] $RustDeskVersion = "1.3.9"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

$programFiles = ${env:ProgramFiles}
$rustExe = Join-Path $programFiles "RustDesk\rustdesk.exe"

if (-not (Test-Path $rustExe)) {
  $temp = Join-Path $env:TEMP "rustdesk-setup"
  New-Item -ItemType Directory -Force -Path $temp | Out-Null
  $installer = Join-Path $temp "rustdesk-$RustDeskVersion-x86_64.exe"
  $url = "https://github.com/rustdesk/rustdesk/releases/download/$RustDeskVersion/rustdesk-$RustDeskVersion-x86_64.exe"
  Write-Host "[rustdesk] Baixando $url ..."
  Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
  Write-Host "[rustdesk] Instalando silenciosamente..."
  Start-Process -FilePath $installer -ArgumentList "--silent-install" -Wait
  Start-Sleep -Seconds 8
}

if (-not (Test-Path $rustExe)) {
  throw "RustDesk nao encontrado em $rustExe apos instalacao."
}

try {
  & $rustExe --install-service 2>$null
} catch {
  Write-Warning "[rustdesk] --install-service: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2
$id = ""
try {
  $id = (& $rustExe --get-id 2>$null | Out-String).Trim()
} catch {
  Write-Warning "[rustdesk] Nao foi possivel ler --get-id"
}

$payload = @{
  rustdesk_id = $id
  installed_at = (Get-Date).ToString("o")
  rustdesk_path = $rustExe
  hostname = $env:COMPUTERNAME
} | ConvertTo-Json -Compress

$configPath = Join-Path $ConfigDir "remote-access.json"
Set-Content -Path $configPath -Value $payload -Encoding UTF8
Write-Host "[rustdesk] ID=$id salvo em $configPath"
