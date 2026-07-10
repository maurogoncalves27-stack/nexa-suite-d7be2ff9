# Aplica migrações TEF pendentes no Supabase remoto.
# Pré-requisitos: supabase login + supabase link --project-ref ixjgmerxxakdkfdzgumy
# Usage: .\scripts\deploy-tef-migrations.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Aplicando migrações TEF no Supabase..." -ForegroundColor Cyan
npx --yes supabase db push
if ($LASTEXITCODE -ne 0) {
  throw "supabase db push falhou. Rode: npx supabase login && npx supabase link --project-ref ixjgmerxxakdkfdzgumy"
}

Write-Host "Migrações aplicadas." -ForegroundColor Green
Write-Host "Inclui:" -ForegroundColor DarkGray
Write-Host "  - 20260707120000_tef_pending_confirmation_status.sql" -ForegroundColor DarkGray
Write-Host "  - 20260707200000_tef_transactions_audit_per_reqnum.sql" -ForegroundColor DarkGray
