#Requires -Version 5.1
<#
  Após baixar o ACBrLibNFe DEMO no fórum (logado), rode este script.
  Procura zip/exe em Downloads, extrai, copia ACBrLib.ini exportável para C:\NexaACBr\bin.
#>
param(
  [string]$DemoPath = "",
  [string]$TargetIni = "C:\NexaACBr\bin\ACBrLib.ini"
)

$ErrorActionPreference = "Stop"

if (-not $DemoPath) {
  $patterns = @(
    "$env:USERPROFILE\Downloads\*ACBrLibNFe*Demo*",
    "$env:USERPROFILE\Downloads\*ACBrLibNFe*DEMO*",
    "$env:USERPROFILE\Downloads\*ACBrLibNFe*demo*"
  )
  foreach ($pat in $patterns) {
    $hit = Get-ChildItem $pat -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($hit) { $DemoPath = $hit.FullName; break }
  }
}

if (-not $DemoPath -or -not (Test-Path $DemoPath)) {
  Write-Host @"

Arquivo do DEMO não encontrado em Downloads.

1. Abra (logado): https://www.projetoacbr.com.br/forum/files/file/476-acbrlibnfe-demo/
2. Clique em Download
3. Rode de novo:

   powershell -ExecutionPolicy Bypass -File scripts\install-acbr-demo-ini.ps1 -DemoPath `"C:\Users\Mauro\Downloads\arquivo-baixado.zip`"

"@ -ForegroundColor Yellow
  exit 1
}

Write-Host "Usando: $DemoPath" -ForegroundColor Cyan
$work = Join-Path $env:TEMP "acbr-demo-install"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null

$ext = [IO.Path]::GetExtension($DemoPath).ToLowerInvariant()
if ($ext -eq ".zip") {
  Expand-Archive -Path $DemoPath -DestinationPath $work -Force
} elseif ($ext -eq ".exe") {
  Copy-Item $DemoPath (Join-Path $work "ACBrLib.NFe.Demo.exe") -Force
  Write-Host @"

Instalador/exe extraído em: $work

Abra o DEMO manualmente, configure:
  - Certificado: C:\NexaACBr\cert\CertificadoMatriz.pfx
  - SSL: Crypt=OpenSSL(1), Http=WinINet(1), XmlSign=LibXml2(4)
  - Ambiente: Homologação
  - Schemas: C:\NexaACBr\Schemas\NFe

Depois: Configurações > Gravar INI > salve em C:\NexaACBr\bin\ACBrLib.ini

"@ -ForegroundColor Green
  Start-Process (Join-Path $work "ACBrLib.NFe.Demo.exe") -ErrorAction SilentlyContinue
  exit 0
} else {
  throw "Formato não suportado: $ext (use .zip ou .exe)"
}

$ini = Get-ChildItem $work -Recurse -Filter "ACBrLib.ini" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ini) {
  $bak = "$TargetIni.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  if (Test-Path $TargetIni) { Copy-Item $TargetIni $bak -Force }
  $text = [IO.File]::ReadAllText($ini.FullName)
  if ($text.StartsWith([char]0xFEFF)) { $text = $text.Substring(1) }
  [IO.File]::WriteAllText($TargetIni, $text, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "ACBrLib.ini copiado para $TargetIni" -ForegroundColor Green
  if ($bak) { Write-Host "Backup: $bak" }
  Write-Host "Reinicie o agente e teste: Invoke-RestMethod http://127.0.0.1:3030/health"
  exit 0
}

$demoExe = Get-ChildItem $work -Recurse -Filter "*NFe*Demo*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($demoExe) {
  Write-Host "Demo encontrado: $($demoExe.FullName)" -ForegroundColor Green
  Write-Host "Abrindo... Configure certificado/CSC e grave INI em C:\NexaACBr\bin\ACBrLib.ini"
  Start-Process $demoExe.FullName
  exit 0
}

Write-Host "Conteúdo extraído em $work — não achei ACBrLib.ini nem .exe automaticamente." -ForegroundColor Yellow
explorer $work
