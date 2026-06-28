# Prepara o repo para editar no Lovable sem perder trabalho do Cursor.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/prepare-lovable-work.ps1
#
# O que faz:
# 1) Salva alteracoes locais em branch feature/cursor-snapshot-<data-hora>
# 2) Envia o branch para o GitHub
# 3) Volta o PC para main limpo (igual origin/main)
# 4) Mostra o que avisar o Lovable/Codex se algo quebrar

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path ".git")) {
  throw "Nao e um repositorio git: $repoRoot"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$branchName = "feature/cursor-snapshot-$timestamp"
$currentBranch = (git branch --show-current).Trim()

Write-Host ""
Write-Host "=== Preparar Lovable ===" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host "Branch atual: $currentBranch"
Write-Host ""

$status = git status --porcelain
if ($status) {
  if ($currentBranch -eq "main") {
    git checkout -b $branchName
    Write-Host "Criado branch: $branchName" -ForegroundColor Green
  } else {
    $branchName = $currentBranch
    Write-Host "Mantendo branch: $branchName" -ForegroundColor Yellow
  }

  git add -A
  git commit -m "Snapshot Cursor antes do Lovable ($timestamp)" -m "Gerado por scripts/prepare-lovable-work.ps1"
  Write-Host "Commit criado." -ForegroundColor Green

  git push -u origin $branchName
  Write-Host "Push: origin/$branchName" -ForegroundColor Green
} else {
  Write-Host "Nenhuma alteracao local para salvar." -ForegroundColor Yellow
  if ($currentBranch -ne "main") {
    Write-Host "Dica: voce nao esta em main. Considere merge antes do Lovable." -ForegroundColor Yellow
  }
}

if ((git branch --show-current).Trim() -ne "main") {
  git checkout main
}

git pull origin main
Write-Host "main atualizado com origin/main." -ForegroundColor Green

Write-Host ""
Write-Host "=== Pode abrir o Lovable (branch main) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "AVISE O LOVABLE/CODEX SE ALGO QUEBRAR - checklist:" -ForegroundColor Yellow
Write-Host "  1) .env - VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY"
Write-Host "  2) src/integrations/supabase/client.ts - URL e anon key do projeto ixjgmerxxakdkfdzgumy"
Write-Host "  3) src/integrations/supabase/types.ts - tipos do Supabase (regenerar se DB mudou)"
Write-Host "  4) supabase/config.toml - project_id ixjgmerxxakdkfdzgumy"
Write-Host "  5) Edge functions - secrets (PAYGO, iFood, Z-API, LOVABLE_API_KEY, etc.)"
Write-Host "  6) Publish Lovable - frontend; migrations/functions sobem no sync"
Write-Host ""
Write-Host "Trabalho Cursor salvo em: $branchName"
Write-Host "Depois do Lovable, no Cursor:"
Write-Host "  git pull origin main"
Write-Host "  git checkout $branchName"
Write-Host "  git merge main"
Write-Host ""
