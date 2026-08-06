# =====================================================================
# NEXA Garçom - Build do APK de RELEASE assinado (Gertec GPOS780)
# ---------------------------------------------------------------------
# Uso (PowerShell, na raiz do repo):
#   .\scripts\build-apk-release.ps1
#   .\scripts\build-apk-release.ps1 -KeystorePassword "minhaSenha"
#
# O script:
#   1. Valida Java/Android SDK
#   2. Cria a keystore (uma única vez) em android\keystore\nexa-release.jks
#   3. Escreve android\keystore.properties (não versionado)
#   4. Injeta signingConfigs release no android\app\build.gradle
#   5. Roda vite build + cap sync + gradlew assembleRelease
# =====================================================================

param(
  [string]$KeystorePassword = "",
  [string]$KeyAlias = "nexa",
  [string]$SdkDir = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$JavaHome = "C:\Program Files\Android\Android Studio\jbr"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== NEXA Garcom :: build APK release ==" -ForegroundColor Cyan

# --- 1. Java ---------------------------------------------------------
if (Test-Path $JavaHome) {
  $env:JAVA_HOME = $JavaHome
  $env:Path = "$JavaHome\bin;$env:Path"
}
if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
  throw "keytool nao encontrado. Instale o Android Studio (JDK 17) ou ajuste -JavaHome."
}

# --- 2. Projeto android ---------------------------------------------
if (-not (Test-Path "$root\android")) {
  Write-Host "Pasta android/ nao existe. Rodando npx cap add android..." -ForegroundColor Yellow
  npx cap add android
}

if (-not (Test-Path "$SdkDir")) {
  throw "Android SDK nao encontrado em $SdkDir. Instale o SDK Platform 34 ou passe -SdkDir."
}
"sdk.dir=$($SdkDir -replace '\\','\\\\')" | Out-File -Encoding ascii "$root\android\local.properties"

# --- 3. Keystore -----------------------------------------------------
$keystoreDir = "$root\android\keystore"
$keystorePath = "$keystoreDir\nexa-release.jks"
New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null

if (-not (Test-Path $keystorePath)) {
  if (-not $KeystorePassword) {
    $sec = Read-Host "Defina a senha da keystore (guarde em local seguro)" -AsSecureString
    $KeystorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
  Write-Host "Gerando keystore em $keystorePath ..." -ForegroundColor Yellow
  keytool -genkeypair -v `
    -keystore $keystorePath `
    -alias $KeyAlias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $KeystorePassword -keypass $KeystorePassword `
    -dname "CN=NEXA Gestao Inteligente, OU=NEXA Suite, O=NEXA Gestao Inteligente, L=Brasilia, ST=DF, C=BR"
  Write-Host "IMPORTANTE: faca backup de $keystorePath e da senha." -ForegroundColor Red
} else {
  Write-Host "Keystore ja existe: $keystorePath" -ForegroundColor Green
  if (-not $KeystorePassword) {
    $sec = Read-Host "Senha da keystore existente" -AsSecureString
    $KeystorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
}

@"
storeFile=keystore/nexa-release.jks
storePassword=$KeystorePassword
keyAlias=$KeyAlias
keyPassword=$KeystorePassword
"@ | Out-File -Encoding ascii "$root\android\keystore.properties"

# --- 4. build.gradle -------------------------------------------------
$gradlePath = "$root\android\app\build.gradle"
$gradle = [IO.File]::ReadAllText($gradlePath)
# remove BOM eventualmente gravado por execucoes anteriores (Gradle nao aceita)
$gradle = $gradle -replace "^\uFEFF", ""

if ($gradle -notmatch "keystore.properties") {
  Write-Host "Injetando signingConfigs no build.gradle..." -ForegroundColor Yellow

  $header = @"
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}

"@
  $gradle = $header + $gradle

  $signing = @"
    signingConfigs {
        release {
            if (keystoreProps['storeFile']) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }

"@
  # insere logo apos "android {"
  $gradle = [regex]::Replace($gradle, "(?m)^android\s*\{\s*$", "android {`r`n$signing", 1)

  # aponta o buildType release para a signingConfig
  $gradle = [regex]::Replace(
    $gradle,
    "(?s)(buildTypes\s*\{\s*release\s*\{)",
    "`$1`r`n            signingConfig signingConfigs.release",
    1)

  # grava SEM BOM (UTF8Encoding($false)) - com BOM o Gradle falha em "line 1, column 1"
  [IO.File]::WriteAllText($gradlePath, $gradle, [System.Text.UTF8Encoding]::new($false))
} else {
  Write-Host "build.gradle ja configurado para assinatura." -ForegroundColor Green
  # garante que nao ficou BOM de execucao anterior
  [IO.File]::WriteAllText($gradlePath, $gradle, [System.Text.UTF8Encoding]::new($false))
}

# --- 5. Build --------------------------------------------------------
Write-Host "Build web (vite)..." -ForegroundColor Cyan
npx vite build
Write-Host "Sincronizando Capacitor..." -ForegroundColor Cyan
npx cap sync android

Write-Host "Gradle assembleRelease..." -ForegroundColor Cyan
Push-Location "$root\android"
.\gradlew.bat assembleRelease
Pop-Location

$apk = "$root\android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
  Write-Host "`nAPK ASSINADO GERADO:" -ForegroundColor Green
  Write-Host $apk -ForegroundColor Green
  Write-Host "Envie este arquivo para o MDM da Gertec." -ForegroundColor Green
} else {
  throw "Build terminou mas o APK nao foi encontrado em $apk"
}
