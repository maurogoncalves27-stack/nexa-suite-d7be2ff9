# NEXA ACBr Agent

Agente HTTP local que expõe a **ACBrLib** (NFC-e + TEF) na porta **3030** para o NEXA Suite consumir.

## Requisitos

- Windows x64
- Node.js 18+
- ACBrLib instalada em `C:\NexaACBr\bin\` contendo:
  - `ACBrNFe64.dll` (NFC-e/NFe)
  - `ACBrTEFD64.dll` (TEF — opcional)
  - `ACBrLib.ini` configurado com certificado, CSC, ambiente
  - `Schemas/` (XSDs SEFAZ)
  - `logs/` (vazio, gravável)

Para apontar para outro diretório, defina `ACBR_BASE`:

```powershell
$env:ACBR_BASE = "D:\AlgumOutroDir\bin"
```

## Instalação

```powershell
cd C:\Users\Mauro\Documents\GitHub\rhplus\electron-acbr
npm install
```

## Rodar (modo dev — janela Electron + tray)

```powershell
npm start
```

Abre janela 520×380 com status do agente, NFC-e e TEF. Minimiza para o tray.

## Rodar em modo console (sem Electron)

```powershell
npm run start:console
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | `/health` | Status do agente, versão da lib, disponibilidade NFC-e/TEF |
| GET    | `/nfce/status` | `StatusServico` SEFAZ-DF |
| POST   | `/nfce/emitir` | Body: `{ iniContent, imprimir?, sincrono? }` |
| POST   | `/nfce/cancelar` | Body: `{ chave, justificativa, cnpj, seqEvento? }` |
| POST   | `/tef/iniciar` | Body: `{ valor, tipo: 'credito'\|'debito'\|'pix', parcelas?, financiamento? }` |
| POST   | `/tef/cancelar` | Aborta transação TEF em andamento |

### Exemplo rápido

```powershell
# Sanity check
curl http://localhost:3030/health

# Pingar SEFAZ
curl http://localhost:3030/nfce/status
```

## Empacotamento (instalador .exe)

```powershell
npm run dist:win
```

Gera `release/NEXA ACBr Agent Setup x.y.z.exe`.

## Variáveis de ambiente

| Var | Padrão | Uso |
|-----|--------|-----|
| `ACBR_BASE` | `C:\NexaACBr\bin` | Diretório com DLLs + `ACBrLib.ini` |
| `ACBR_AGENT_PORT` | `3030` | Porta HTTP |
