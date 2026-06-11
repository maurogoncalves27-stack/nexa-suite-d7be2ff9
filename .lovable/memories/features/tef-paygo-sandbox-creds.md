---
name: TEF PayGo - credenciais sandbox fixas
description: Dados fixos de homologação PayGo (PdC, CNPJ, endereço, DLL) — usar sempre nos testes
type: feature
---

# TEF PayGo — Credenciais Sandbox (FIXAS, NUNCA ESQUECER)

Usar SEMPRE estes valores em qualquer teste/homologação PayGo enquanto não houver dados de produção:

| Campo | Valor |
|---|---|
| **Ponto de Captura (PdC)** | `111476` |
| **CNPJ de Instalação** | `44.932.369/0001-08` (sem máscara: `44932369000108`) |
| **Endereço do Ambiente** | `pos-transac-sb.tpgweb.io` |
| **Porta** | `31735` |
| **Caminho da DLL** | `C:\Program Files (x86)\PayGo\PGWebLib\PGWebLib.dll` |
| **Ambiente CPAY** | `DEMO` |

## Variáveis de ambiente (PowerShell)

```powershell
$env:CPFCNPJ = "44932369000108"
$env:PontoDeCaptura = "111476"
$env:AmbienteCPAY = "DEMO"
$env:PGWEBLIB_PATH = "C:\Program Files (x86)\PayGo\PGWebLib\PGWebLib.dll"
```

## Onde aparece no código

- `electron-acbr/acbr-tefd.cjs` — lê `PGWEBLIB_PATH`, `CPFCNPJ`, `PontoDeCaptura`, `AmbienteCPAY`
- `electron-acbr/config-samples/ACBrLibTEFD.ini` — seção `[TEFD_PayGo]`
- `src/pages/TefPaygoSetup.tsx` / `TefConfigPanel` — campos `merchant_code` (CNPJ) e `terminal_code` (PdC)

NÃO substituir por placeholders genéricos. Esses são os dados oficiais Setis de sandbox para o projeto NEXA.
