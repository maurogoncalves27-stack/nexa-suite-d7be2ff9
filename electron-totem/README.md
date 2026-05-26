# Nexa Totem (Electron / kiosk)

Wrapper desktop do **Nexa Totem** (autoatendimento). Gera um instalador `.exe` que abre o app em **kiosk fullscreen** apontando para `https://rhplus.lovable.app/totem`, com:

- Impressão ESC/POS direto na **Gertec G250W** (USB, via `node-thermal-printer`).
- Agente local **SiTef** (`http://127.0.0.1:60906` e `http://localhost:60906`) para pagamento no **pinpad Gertec PPC930**.
- Atualização automática (qualquer publicação no Lovable atinge todos os totens sem reinstalar).

## ⚠️ Onde rodar o build

Este build **precisa ser feito na sua máquina Windows** — o sandbox do Lovable não consegue empacotar Electron (faltam binários nativos do `electron-builder`).

## 1. Pré-requisitos (na máquina Windows)

- Node.js 20+ (https://nodejs.org/)
- Git
- Drivers da Gertec G250W instalados e impressora aparecendo em **Painel de Controle → Dispositivos e Impressoras** (geralmente como `Gertec G250` ou `POS-80`).
- Pinpad PPC930 conectado por USB (driver Gertec instalado).

## 2. Clonar o projeto e instalar deps

```bash
git clone <URL_DO_REPO_GITHUB>
cd <pasta-do-projeto>/electron-totem
git pull --rebase
npm install
```

Antes de empacotar, confirme que o `npm` está lendo a pasta certa:

```bash
node -p "require('./package.json').version"
```

Precisa imprimir `1.0.27`. Se imprimir `1.0.24`, você está em uma cópia antiga do repositório ou o `git pull` não trouxe esta pasta.

## 3. Adicionar o ícone

Coloque dois arquivos nesta pasta:

- `icon.ico` — 256×256 (Windows). Use https://icoconvert.com/
- `icon.png` — 512×512 (fallback)

(Pode reaproveitar os mesmos da pasta `electron/` — basta copiar.)

## 4. Gerar o instalador

```bash
# Instalador NSIS (.exe) — recomendado
npm run dist:win

# OU portátil (single .exe sem instalação)
npm run dist:win-portable
```

Saída: `electron-totem/release/Nexa Totem Setup 1.0.27.exe` (~80–120 MB).

## 5. Instalar no totem

1. Copie o `.exe` pro totem (pendrive / rede).
2. Execute como administrador → instala em `C:\Program Files\Nexa Totem\`.
3. Marque pra criar **atalho na área de trabalho**.
4. (Opcional) Coloque o atalho em **Iniciar → Programas → Inicializar** (`shell:startup`) pra abrir sozinho ao ligar a máquina.

## 6. Modo kiosk

Por padrão o app abre em **fullscreen kiosk** (sem barra, sem botões de fechar, F11/Alt+F4 bloqueados).

**Atalho secreto pra sair**: `Ctrl + Shift + Alt + Q`.

Pra desabilitar o kiosk (útil em desenvolvimento), defina `NEXA_KIOSK=false` antes de iniciar.

## 7. Configurar a impressora Gertec G250

A impressora aparece automaticamente em **Configurações → PDV → Impressoras** (lê do Windows via IPC `printers:list`).

1. Abra o app.
2. Vá em PDV → Impressoras.
3. Cadastre uma nova impressora:
   - **Nome**: `Gertec G250 - Totem`
   - **Conexão**: USB
   - **Dispositivo**: selecione `Gertec G250` (ou nome equivalente)
   - **Modelo**: `Gertec G250`
   - **Função (`print_role`)**: `totem`
   - **Loja**: a loja onde o totem está
4. Clique em **Testar impressão** — deve sair um cupom de teste.

## 8. Configurar o pinpad PPC930 (SiTef)

### Modo stub (padrão — testa o fluxo sem pinpad real)

Já vem habilitado (`SITEF_MOCK=true`). O app simula aprovação/recusa pra você validar a UX antes do credenciamento.

### Modo real (homologação SiTef/C6 Pay)

1. Coloque a `CliSiTef.dll` (Software Express) ao lado do `Nexa Totem.exe` (em `C:\Program Files\Nexa Totem\`) ou em `C:\SiTef\`.
2. Crie/edite as variáveis de ambiente do Windows (Painel de Controle → Sistema → Variáveis de ambiente):
   ```
   SITEF_MOCK=false
   SITEF_DLL_PATH=C:\SiTef\CliSiTef.dll
   SITEF_IP_SITEF=10.x.x.x
   SITEF_LOJA=00000000
   SITEF_TERMINAL=TOT00001
   ```
3. Reinicie o totem.
4. No app: PDV → TEF → deve mostrar **"Agente SiTef online · modo: real"**.
5. Se for testar no navegador do Windows, abra `http://127.0.0.1:60906/sitef/health` ou `http://localhost:60906/sitef/health`; ambos devem responder.

## 9. Testar localmente sem empacotar

```bash
npm start
```

Abre uma janela Electron apontando pra `http://localhost:8080/totem` (Vite dev) — útil pra validar mudanças antes de buildar.

## 10. Customizar

| O quê                | Onde                                                    |
|----------------------|---------------------------------------------------------|
| URL carregada        | `main.cjs` → `APP_URL` ou env `NEXA_URL`                |
| Sair do kiosk        | env `NEXA_KIOSK=false` antes de iniciar                 |
| Atalho de saída      | `main.cjs` → `globalShortcut.register("Ctrl+Shift+Alt+Q", …)` |
| Nome / versão        | `package.json` → `productName`, `version`               |
| Ícone instalador     | `package.json` → `build.nsis.installerIcon`             |

## 11. Assinatura digital (evitar SmartScreen)

Sem assinatura, o Windows exibe "Editor desconhecido". Para remover:

- Compre certificado de Code Signing (Sectigo, DigiCert — ~R$ 1.000/ano).
- Configure em `package.json` → `build.win.certificateFile` + `certificatePassword`.
