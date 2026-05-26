# Nexa Desktop (Electron)

Wrapper desktop do Nexa que gera um instalador `.exe` para Windows (NSIS) e
opcionalmente builds para macOS e Linux.

## Modo padrão: wrapper online

Por padrão (`main.cjs` → `USE_LOCAL_BUILD = false`), o app abre uma janela
nativa carregando `https://nexa.aquelaparme.com.br`. Vantagens:

- **Atualização automática** — toda vez que você publica no Lovable, todos os
  usuários já recebem a nova versão sem precisar reinstalar.
- **Instalador menor** (~80 MB em vez de ~150 MB).
- **Login, câmera, notificações, banco** — tudo continua funcionando igual ao
  navegador.

Se quiser empacotar a build local (offline-first parcial), abra `main.cjs`,
mude `USE_LOCAL_BUILD = true`, e rode `npm run build` na raiz do projeto antes
de empacotar.

## Como gerar o instalador `.exe` (Windows)

> ⚠️ Esses comandos rodam **na sua máquina**, não no Lovable. O sandbox do
> Lovable não suporta executar `electron-builder` (faltam binários nativos).

### 1. Pré-requisitos

- Node.js 20+ instalado ([nodejs.org](https://nodejs.org/))
- Git para clonar o projeto

### 2. Clonar o projeto e instalar deps

```bash
git clone <URL_DO_REPO_GITHUB>
cd <pasta-do-projeto>/electron
npm install
```

### 3. Adicionar o ícone

Coloque dois arquivos nesta pasta `electron/`:

- `icon.ico` — ícone Windows (256×256, formato .ico). Use https://icoconvert.com/
- `icon.png` — ícone macOS/Linux (512×512 ou 1024×1024 PNG)

### 4. Gerar o instalador

```bash
# Instalador NSIS (.exe) — recomendado
npm run dist:win

# OU versão portátil (single .exe sem instalação)
npm run dist:win-portable
```

O instalador sai em `electron/release/Nexa Setup 1.0.0.exe` (~80–120 MB).

### 5. (Opcional) macOS / Linux

```bash
npm run dist:mac    # gera .dmg (precisa rodar em macOS)
npm run dist:linux  # gera .AppImage
```

## Testar localmente antes de empacotar

```bash
npm start
```

Abre uma janela Electron com a URL de produção. DevTools abre automaticamente
em modo dev.

## Customizar

- **URL carregada**: `main.cjs` → `REMOTE_URL`
- **Nome / versão**: `package.json` → `productName`, `version`
- **Ícone instalador**: `package.json` → `build.nsis.installerIcon`
- **Atalho desktop / menu iniciar**: já habilitados por padrão
- **Permitir trocar pasta de instalação**: `allowToChangeInstallationDirectory: true`

## Build offline (opcional)

Se quiser que o app funcione sem internet (limitado — backend continua
exigindo conexão):

1. `main.cjs` → `USE_LOCAL_BUILD = true`
2. Na raiz do projeto, edite `vite.config.ts` adicionando `base: './'`
3. Na raiz: `npm run build`
4. Em `electron/package.json` → `build.files`, adicione `"../dist/**/*"`
5. `cd electron && npm run dist:win`

## Agente SiTef (TEF / pinpad)

O Electron sobe automaticamente um agente HTTP local em
`http://127.0.0.1:60906` (ver `electron/sitef-agent.cjs`). Esse agente é o
ponte entre o app web e a `CliSiTef.dll` da Software Express.

**Modo padrão: stub** — simula o fluxo do pinpad (conectando → aguardando
cartão → aprovado/negado) sem precisar de hardware nem da DLL. Útil pra QA
e demo. Habilitado por padrão (`SITEF_MOCK=true`).

**Modo real** — quando o credenciamento C6 Pay + SiTef estiver pronto:

1. Coloque a `CliSiTef.dll` (32 ou 64-bit, conforme a build do Electron) ao
   lado do `Nexa.exe` instalado, ou em `C:\\SiTef\\`.
2. Defina as variáveis de ambiente antes de iniciar o app:
   - `SITEF_MOCK=false`
   - `SITEF_DLL_PATH=C:\\SiTef\\CliSiTef.dll`
   - `SITEF_IP_SITEF=10.x.x.x` (IP do servidor SiTef)
   - `SITEF_LOJA=00000000` (código da loja credenciado na C6/SiTef)
   - `SITEF_TERMINAL=REST0001` (terminal lógico)
   - (opcional) `SITEF_AGENT_PORT=60906`
3. Implemente as chamadas FFI em `runRealTransaction` dentro de
   `electron/sitef-agent.cjs` (handshake `IniciaFuncaoSiTefInterativo` +
   `ContinuaFuncaoSiTefInterativo`). A interface HTTP exposta para o app
   web não muda — só a implementação interna.
4. Reinicie o `Nexa.exe`. O painel TEF (em /pdv-novo → TEF) mostrará
   "Agente SiTef online · modo: real".

### Endpoints expostos pelo agente

| Método | Caminho           | Função                                            |
|--------|-------------------|---------------------------------------------------|
| GET    | `/sitef/health`   | `{ ok, mode: stub\|real, version, busy }`         |
| POST   | `/sitef/iniciar`  | Dispara venda. Body: `{ funcao, valor, ... }`     |
| POST   | `/sitef/cancelar` | Aborta a transação corrente                       |
| GET    | `/sitef/eventos`  | SSE — `{ type:"status", status, message }`        |

## Assinatura digital (evitar SmartScreen)

Sem assinatura, o Windows mostra "Editor desconhecido" no instalador.
Para remover esse aviso é necessário comprar um certificado de Code Signing
(Sectigo, DigiCert — ~R$ 1.000/ano) e configurar em
`build.win.certificateFile` + `build.win.certificatePassword`.
