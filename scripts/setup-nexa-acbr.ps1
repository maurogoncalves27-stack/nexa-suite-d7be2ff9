#Requires -Version 5.1
<#
.SYNOPSIS
  Instala/sincroniza ACBrLib NFe em C:\NexaACBr a partir do pacote oficial.
.DESCRIPTION
  - Copia DLL MT StdCall + dependências OpenSSL/LibXml2
  - Sincroniza Schemas e ACBrNFeServicos.ini
  - Baixa zlib1 (se faltar) e VC++ Redistributable x64
  - Isola DLLs PayGo/Warsaw fora de bin\ (evita conflito na NFC-e)
#>
param(
  [string]$ZipPath = "",
  [string]$TargetRoot = "C:\NexaACBr",
  [switch]$SkipVcRedist,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ensure-Dir($p) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null } }

if (-not $ZipPath) {
  $candidates = @(
    (Join-Path $env:USERPROFILE "Downloads\ACBrLibNFeDemo-Windows-1.5.1.461.7z"),
    (Join-Path $env:USERPROFILE "Downloads\ACBrLibNFe-Windows-1.5.0.462.zip"),
    (Join-Path $env:USERPROFILE "Downloads\ACBrLibNFe-Windows-1.5.0.456.zip"),
    (Join-Path $env:USERPROFILE "Downloads\ACBrLibNFe-Windows-1.5.0.456 (1).zip")
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $ZipPath = $c; break }
  }
}

$extractRoot = Join-Path $env:TEMP "nexa-acbr-setup"
$pkgRoot = $null

$demoRoot = "C:\NexaACBr\tools\ACBrLibNFeDemo-1.5.1.461"
if (Test-Path (Join-Path $demoRoot "Windows")) {
  $pkgRoot = $demoRoot
  Write-Step "Usando pacote demo extraído: $pkgRoot"
}

if (-not $pkgRoot -and $ZipPath -and (Test-Path $ZipPath)) {
  Write-Step "Pacote local: $ZipPath"
  Ensure-Dir $extractRoot
  $dest = Join-Path $extractRoot ( [IO.Path]::GetFileNameWithoutExtension($ZipPath) )
  if (-not (Test-Path (Join-Path $dest "Windows"))) {
    Write-Host "Extraindo zip..."
    if (-not $WhatIf) { Expand-Archive -Path $ZipPath -DestinationPath $extractRoot -Force }
  }
  if (Test-Path $dest) { $pkgRoot = $dest }
  else {
    $found = Get-ChildItem $extractRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName "Windows") } | Select-Object -First 1
    if ($found) { $pkgRoot = $found.FullName }
  }
}

if (-not $pkgRoot) {
  $existing = @(
    (Get-ChildItem "C:\NexaACBr\tools" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "ACBrLibNFeDemo-*" -and (Test-Path (Join-Path $_.FullName "Windows")) } | Sort-Object Name -Descending | Select-Object -First 1),
    (Get-ChildItem (Join-Path $env:USERPROFILE "Downloads") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "ACBrLibNFe-Windows-*" -and (Test-Path (Join-Path $_.FullName "Windows")) } | Sort-Object Name -Descending | Select-Object -First 1)
  ) | Where-Object { $_ } | Select-Object -First 1
  if ($existing) {
    $pkgRoot = $existing.FullName
    Write-Step "Usando pasta já extraída: $pkgRoot"
  }
}

if (-not $pkgRoot) {
  throw "Pacote ACBrLibNFe não encontrado. Baixe ACBrLibNFe-Windows-*.zip em Downloads e rode de novo."
}

$dllSrc = Join-Path $pkgRoot "Windows\ST\StdCall\ACBrNFe64.dll"
if (-not (Test-Path $dllSrc)) {
  $dllSrc = Join-Path $pkgRoot "Windows\MT\StdCall\ACBrNFe64.dll"
  Write-Warning "ST StdCall não encontrada; usando MT (requer API com handle no wrapper)."
}
if (-not (Test-Path $dllSrc)) { throw "DLL não encontrada: $dllSrc" }

$bin = Join-Path $TargetRoot "bin"
$logs = Join-Path $TargetRoot "logs"
$dfe = Join-Path $TargetRoot "dfe"
$cert = Join-Path $TargetRoot "cert"
$schemas = Join-Path $TargetRoot "Schemas"
$paygo = Join-Path $TargetRoot "paygo-isolated"

foreach ($d in @($bin, $logs, $dfe, $cert, $schemas, $paygo)) { Ensure-Dir $d }

Write-Step "Copiando DLL principal + dependências"
$copyItems = @(
  @{ From = $dllSrc; To = Join-Path $bin "ACBrNFe64.dll" },
  @{ From = Join-Path $pkgRoot "dep\OpenSSL\x64\*.dll"; To = $bin },
  @{ From = Join-Path $pkgRoot "dep\LibXml2\x64\*.dll"; To = $bin },
  @{ From = Join-Path $pkgRoot "dep\ACBrNFeServicos.ini"; To = Join-Path $bin "ACBrNFeServicos.ini" }
)
foreach ($item in $copyItems) {
  if ($WhatIf) { Write-Host "COPY $($item.From) -> $($item.To)"; continue }
  if ($item.From -like "**") {
    Copy-Item $item.From $item.To -Force
  } else {
    Copy-Item $item.From $item.To -Force
  }
}

Write-Step "Sincronizando Schemas NFe"
$schemaSrc = Join-Path $pkgRoot "dep\Schemas"
if ($WhatIf) {
  Write-Host "ROBOCOPY $schemaSrc -> $schemas"
} else {
  & robocopy $schemaSrc $schemas /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
}

# zlib1 — libxml2 no Windows costuma precisar; não vem no zip NFe
$zlibPath = Join-Path $bin "zlib1.dll"
if (-not (Test-Path $zlibPath)) {
  Write-Step "Baixando zlib1.dll (x64)"
  $zlibUrl = "https://raw.githubusercontent.com/kiyolee/zlib-win-build/master/install/x64/bin/zlib1.dll"
  if ($WhatIf) {
    Write-Host "GET $zlibUrl -> $zlibPath"
  } else {
    try {
      Invoke-WebRequest -Uri $zlibUrl -OutFile $zlibPath -UseBasicParsing
      Write-Host "OK zlib1.dll"
    } catch {
      Write-Warning "Falha ao baixar zlib1: $($_.Exception.Message)"
    }
  }
}

# Isolar DLLs que não são da NFC-e
foreach ($foreign in @("PGWebLib.dll", "warsaw.dll", "ACBrNFe32.dll")) {
  $src = Join-Path $bin $foreign
  if (Test-Path $src) {
    $dst = Join-Path $paygo $foreign
    Write-Step "Isolando $foreign -> paygo-isolated\"
    if (-not $WhatIf) { Move-Item $src $dst -Force }
  }
}

# VC++ Redistributable 2015-2022 x64
if (-not $SkipVcRedist) {
  $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
  $vcInstaller = Join-Path $env:TEMP "vc_redist.x64.exe"
  $vcKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
  $vcOk = $false
  if (Test-Path $vcKey) {
    $p = Get-ItemProperty $vcKey -ErrorAction SilentlyContinue
    $vcOk = ($p.Installed -eq 1)
  }
  if (-not $vcOk) {
    Write-Step "Instalando VC++ Redistributable x64 (necessário para ACBr/OpenSSL)"
    if ($WhatIf) {
      Write-Host "GET $vcUrl e executar /install /quiet /norestart"
    } else {
      Invoke-WebRequest -Uri $vcUrl -OutFile $vcInstaller -UseBasicParsing
      Start-Process -FilePath $vcInstaller -ArgumentList "/install", "/quiet", "/norestart" -Wait
      Write-Host "VC++ Redist instalado (ou já estava presente)."
    }
  } else {
    Write-Host "VC++ Redistributable x64 já instalado."
  }
}

# INI mínimo se não existir
$iniPath = Join-Path $bin "ACBrLib.ini"
if (-not (Test-Path $iniPath)) {
  Write-Step "Criando ACBrLib.ini mínimo (edite certificado/CSC depois)"
  $ini = @"
[Principal]
LogNivel=4
LogPath=$logs

[DFe]
UF=DF
ArquivoPFX=$cert\CertificadoMatriz.pfx
Senha=ALTERE_A_SENHA
SSLCryptLib=1
SSLHttpLib=1
SSLXmlSignLib=4
VerificarValidade=1

[NFe]
VersaoDF=4.00
ModeloDF=1
Ambiente=1
IniServicos=$bin\ACBrNFeServicos.ini
PathSalvar=$dfe
PathSchemas=$schemas\NFe

[Emitente]
CNPJ=44932369000108
IE=0807774200137
UF=DF
Ambiente=1

[Webservice]
UF=DF
Ambiente=1
"@
  if (-not $WhatIf) {
    [System.IO.File]::WriteAllText($iniPath, $ini, (New-Object System.Text.UTF8Encoding $false))
  }
}

Write-Step "Concluído"
Write-Host "Pasta: $TargetRoot"
Write-Host "DLL:   $bin\ACBrNFe64.dll"
Write-Host "INI:   $iniPath"
Write-Host ""
Write-Host "Próximo: reinicie o agente e teste:"
Write-Host "  Invoke-RestMethod http://127.0.0.1:3030/health"
Write-Host "  Invoke-RestMethod http://127.0.0.1:3030/nfce/status"
