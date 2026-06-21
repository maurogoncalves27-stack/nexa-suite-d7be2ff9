
# PWAs separados por papel (Opção C)

Hoje existe **um único** manifest (`public/manifest.json`) chamado "NEXA Suite" servindo todas as áreas. Vamos criar **manifests dedicados** para cada perfil externo, com nome/ícone próprios e `start_url` apontando direto pra área da pessoa.

## Escopo

| Papel | Rota base | Nome do app | Short name | start_url |
|---|---|---|---|---|
| Gestor / colaborador (atual) | `/` | NEXA Suite | NEXA | `/?source=pwa` |
| Sócio | `/area-socio` | NEXA Sócio | Sócio | `/area-socio?source=pwa` |
| Freelancer | `/area-freelancer` | NEXA Freelancer | Freela | `/area-freelancer?source=pwa` |
| Nutricionista | `/area-nutricionista` | NEXA Nutri | Nutri | `/area-nutricionista?source=pwa` |
| Fornecedor | `/portal-fornecedor` | NEXA Fornecedor | Fornecedor | `/portal-fornecedor?source=pwa` |

**Fora de escopo:** Totem e PDV continuam como apps Electron (`.exe`), não viram PWA. Áreas internas (Gestor/Colaborador/RH/Contabilidade) continuam no PWA principal "NEXA Suite".

## O que será feito

1. **Criar 4 novos manifests** em `public/`:
   - `manifest-socio.json`
   - `manifest-freelancer.json`
   - `manifest-nutricionista.json`
   - `manifest-fornecedor.json`
   
   Cada um com `name`, `short_name`, `start_url`, `scope` próprio (ex.: `scope: "/area-socio"`), `theme_color`, `background_color` e referência ao ícone correspondente.

2. **Gerar 4 ícones diferenciados** (mantendo a identidade NEXA — base do `icones/nexa_icone.png` com badge/cor por papel):
   - `public/icons/nexa-socio-192.png` / `-512.png`
   - `public/icons/nexa-freelancer-192.png` / `-512.png`
   - `public/icons/nexa-nutri-192.png` / `-512.png`
   - `public/icons/nexa-fornecedor-192.png` / `-512.png`

3. **Injetar `<link rel="manifest">` dinâmico por rota.** Como o `index.html` é único, criar um componente `RoleManifest` (em `src/components/pwa/RoleManifest.tsx`) que detecta a rota atual e troca a tag `<link rel="manifest" href="...">` + `<meta name="theme-color">` + `<link rel="apple-touch-icon">` apropriados. Montar o componente uma vez no `App.tsx`.

4. **Atualizar memória** (`mem://features/pwa-por-papel`) registrando a estratégia para futuros perfis.

## Como o usuário instala

- **Sócio** acessa `aquelaparme.com.br/area-socio` no celular → "Adicionar à tela inicial" → instala "NEXA Sócio" com ícone próprio, abre direto no painel do sócio.
- Mesma lógica para Freelancer (`/area-freelancer`), Nutricionista (`/area-nutricionista`) e Fornecedor (`/portal-fornecedor`).
- Gestor/colaborador continua instalando pela home (`/`) o "NEXA Suite" como hoje.

## Detalhes técnicos

- **`scope` restritivo por manifest:** garante que, mesmo se o usuário navegar fora da área dele, o PWA instalado continua identificando aquela área como o "app".
- **iOS/Android cacheiam `start_url` e `scope` no momento da instalação** — se mudarmos depois, instalações antigas precisam reinstalar. Por isso definir bem agora.
- **Sem service worker novo.** Mantém regra do projeto (manifest-only, sem offline), conforme skill PWA.
- **Sem mexer em Totem/PDV/Electron** nem em `electron-*/build/icon.*`.
- **Ícones:** gerar 4 variantes (cores/badges sutis) a partir do ícone oficial NEXA para manter coerência visual sem violar a memória de "ícone oficial NEXA".

## Pergunta aberta (posso decidir depois, na execução)

Diferenciação visual dos ícones — opções:
- (a) mesma letra N azul + faixa colorida embaixo com o papel (Sócio/Freela/Nutri/Forn);
- (b) mesma letra N com cor de fundo distinta por papel;
- (c) letra N + ícone pequeno sobreposto (👤 sócio, 🧑‍🍳 freela, 🥗 nutri, 📦 fornecedor).

Sugestão: **(a)** — mantém identidade NEXA forte e diferencia sutilmente.
