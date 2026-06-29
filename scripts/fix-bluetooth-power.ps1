# Desativa suspensao de energia no MediaTek Wi-Fi 7 + Bluetooth (MT7927)
# Execute como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\fix-bluetooth-power.ps1

$ErrorActionPreference = "Stop"

function Set-NoSelectiveSuspend {
  param([string]$InstanceId)
  $base = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $InstanceId
  if (-not (Test-Path -LiteralPath $base)) { return $false }
  $params = Join-Path $base 'Device Parameters'
  if (-not (Test-Path -LiteralPath $params)) { return $false }
  Set-ItemProperty -LiteralPath $params -Name DeviceSelectiveSuspended -Value 0 -Type DWord -Force
  Set-ItemProperty -LiteralPath $params -Name SelectiveSuspendEnabled -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
  return $true
}

Write-Host '=== Fix Bluetooth/Wi-Fi power (MediaTek MT7927) ===' -ForegroundColor Cyan

$usbSub = '2a737441-1930-4402-8d77-b2bebba308a3'
$usbSet = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
powercfg /SETACVALUEINDEX SCHEME_CURRENT $usbSub $usbSet 0 | Out-Null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT $usbSub $usbSet 0 | Out-Null
powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
Write-Host '[OK] USB selective suspend desligado' -ForegroundColor Green

$bt = Get-PnpDevice -FriendlyName 'MediaTek Bluetooth Adapter' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($bt -and (Set-NoSelectiveSuspend $bt.InstanceId)) {
  $paramsPath = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $bt.InstanceId + '\Device Parameters'
  $v = (Get-ItemProperty -LiteralPath $paramsPath).DeviceSelectiveSuspended
  Write-Host "[OK] Bluetooth DeviceSelectiveSuspended = $v" -ForegroundColor Green
} else {
  Write-Host '[WARN] Adaptador Bluetooth nao encontrado' -ForegroundColor Yellow
}

$wifi = Get-PnpDevice -FriendlyName '*MediaTek Wi-Fi*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($wifi -and (Set-NoSelectiveSuspend $wifi.InstanceId)) {
  Write-Host "[OK] Wi-Fi $($wifi.InstanceId)" -ForegroundColor Green
}

foreach ($name in @('bthserv', 'BTAGService', 'BthAvctpSvc')) {
  try {
    Set-Service $name -StartupType Automatic -ErrorAction Stop
    Write-Host "[OK] Servico $name -> Automatic" -ForegroundColor Green
  } catch {
    Write-Host "[WARN] Servico $name : $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'Reinicie o PC. DeviceSelectiveSuspended deve ficar 0.' -ForegroundColor Yellow
