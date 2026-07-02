#Requires -Version 5.1
param(
  [string]$SrcPfx = "C:\NexaACBr\cert\CertificadoMatriz.pfx",
  [string]$DstPfx = "C:\NexaACBr\cert\CertificadoMatriz-acbr.pfx",
  [string]$Password = "123456"
)

$sec = ConvertTo-SecureString $Password -AsPlainText -Force
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
  $SrcPfx, $sec, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
$bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $Password)
[System.IO.File]::WriteAllBytes($DstPfx, $bytes)
Write-Host "PFX reexportado: $DstPfx ($($bytes.Length) bytes)"
Write-Host "Atualize ACBrLib.ini -> [DFe] ArquivoPFX=$DstPfx"
