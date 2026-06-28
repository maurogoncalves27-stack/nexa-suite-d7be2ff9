# Roteiro completo homologação Payer API Localhost
param(
  [string]$Base = "http://127.0.0.1:3030"
)

$predate = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
$script:results = @()
$script:approved = @()

function Wait-PayerFinal {
  param([int]$MaxSec = 120)
  for ($i = 1; $i -le $MaxSec; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-RestMethod "$Base/payer/response" -TimeoutSec 10
      $st = $r.retorno.statusTransaction
      if ($st -and $st -ne "PENDING") { return $r.retorno }
    } catch { }
  }
  return $null
}

function Invoke-PayerPayment {
  param(
    [string]$Label,
    [hashtable]$Body,
    [int]$WaitSec = 120
  )
  Write-Host ""
  Write-Host "=== $Label ===" -ForegroundColor Cyan
  Start-Sleep -Seconds 2
  try {
    $json = $Body | ConvertTo-Json -Compress
    $start = Invoke-RestMethod -Method POST "$Base/payer/payment" -ContentType "application/json" -Body $json -TimeoutSec 45
    if (-not $start.ok) {
      Write-Host "START FAIL: $($start.error)" -ForegroundColor Red
      $script:results += [pscustomobject]@{ Step = $Label; Status = "START_FAIL"; idPayer = ""; Detail = $start.error }
      return $null
    }
    $ret = Wait-PayerFinal -MaxSec $WaitSec
    if (-not $ret) {
      Write-Host "TIMEOUT" -ForegroundColor Red
      $script:results += [pscustomobject]@{ Step = $Label; Status = "TIMEOUT"; idPayer = ""; Detail = "" }
      return $null
    }
    $st = [string]$ret.statusTransaction
    $id = [string]$ret.idPayer
    Write-Host "$st id=$id" -ForegroundColor $(if ($st -eq "APPROVED") { "Green" } elseif ($st -eq "REJECTED") { "Yellow" } else { "Red" })
    $script:results += [pscustomobject]@{ Step = $Label; Status = $st; idPayer = $id; Detail = [string]$ret.paymentMethod }
    if ($st -eq "APPROVED" -and $id) {
      $script:approved += [pscustomobject]@{ Label = $Label; idPayer = $id }
    }
    return $ret
  } catch {
    Write-Host "ERR: $($_.Exception.Message)" -ForegroundColor Red
    $script:results += [pscustomobject]@{ Step = $Label; Status = "ERROR"; idPayer = ""; Detail = $_.Exception.Message }
    return $null
  }
}

function Invoke-PayerCancel {
  param([string]$Label, [string]$IdPayer)
  if (-not $IdPayer) { return }
  Write-Host ""
  Write-Host "=== CANCEL $Label ===" -ForegroundColor Magenta
  Start-Sleep -Seconds 2
  try {
    $body = @{ command = "CANCELLMENT"; idPayer = $IdPayer; wait = $false } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Method POST "$Base/payer/payment" -ContentType "application/json" -Body $body -TimeoutSec 45
    $ret = Wait-PayerFinal -MaxSec 120
    $st = if ($ret) { [string]$ret.statusTransaction } else { "TIMEOUT" }
    Write-Host "CANCEL -> $st" -ForegroundColor $(if ($st -eq "APPROVED") { "Green" } else { "Red" })
    $script:results += [pscustomobject]@{ Step = "CANCEL $Label"; Status = $st; idPayer = $IdPayer; Detail = "" }
  } catch {
    $script:results += [pscustomobject]@{ Step = "CANCEL $Label"; Status = "ERROR"; idPayer = $IdPayer; Detail = $_.Exception.Message }
  }
}

Write-Host "PAYER HOMOLOGACAO E2E - $(Get-Date -Format o)" -ForegroundColor White

Invoke-PayerPayment -Label "Debito a vista" -Body @{ value = 1; paymentMethod = "CARD"; paymentType = "DEBIT"; paymentMethodSubType = "FULL_PAYMENT" }
Invoke-PayerPayment -Label "Credito a vista" -Body @{ value = 1; paymentMethod = "CARD"; paymentType = "CREDIT"; paymentMethodSubType = "FULL_PAYMENT" }
Invoke-PayerPayment -Label "PIX" -Body @{ value = 1; paymentMethod = "PIX" }
Invoke-PayerPayment -Label "Dinheiro" -Body @{ value = 1; paymentMethod = "CASH" } -WaitSec 180
Invoke-PayerPayment -Label "Cred Parc Lojista" -Body @{ value = 10; paymentMethod = "CARD"; paymentType = "CREDIT"; paymentMethodSubType = "FINANCED_NO_FEES"; installments = 2 }
Invoke-PayerPayment -Label "Cred Parc Admin" -Body @{ value = 10; paymentMethod = "CARD"; paymentType = "CREDIT"; paymentMethodSubType = "FINANCED_WITH_FEES"; installments = 2 }
Invoke-PayerPayment -Label "Debito Pre-Datado" -Body @{ value = 1; paymentMethod = "CARD"; paymentType = "DEBIT"; paymentMethodSubType = "PREDATED_DEBIT"; paymentDate = $predate }
Invoke-PayerPayment -Label "Debito Parcelado" -Body @{ value = 10; paymentMethod = "CARD"; paymentType = "DEBIT"; paymentMethodSubType = "FINANCED_DEBIT"; installments = 2; paymentDate = $predate }

foreach ($a in $script:approved) {
  Invoke-PayerCancel -Label $a.Label -IdPayer $a.idPayer
}

Invoke-PayerPayment -Label "Rejeitada tentativa" -Body @{ value = 1; paymentMethod = "CARD"; paymentType = "DEBIT"; paymentMethodSubType = "FULL_PAYMENT" }

Write-Host ""
Write-Host "========== RESUMO ==========" -ForegroundColor White
$script:results | Format-Table -AutoSize
