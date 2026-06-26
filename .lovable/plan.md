
# 3 PWAs no mesmo celular

Sim, dá. O navegador trata cada PWA como app separado pelo par `id` + `scope` do manifest. Basta cada um ter manifest próprio com escopo distinto e ícone/nome próprios. Hoje só existe 1 manifest "geral" (`/manifest.json` chamado "NEXA") sendo servido em todos os hosts, então quem instala pelo site Parmê ou pelo /pedir acaba com um ícone "NEXA" errado.

## O que muda

### 1. Criar 2 manifests novos em `public/`
- **`manifest-parme.json`** — site institucional
  - `name`: "Aquela Parmê", `short_name`: "Parmê"
  - `id`/`start_url`: `/parme?source=pwa`
  - `scope`: `/parme`
  - `theme_color`/`background_color`: vermelho/creme da marca
  - ícones: novos `/icons/parme-192.png` e `/icons/parme-512.png` (logo Aquela Parmê — gerar a partir do asset existente `Logo-Aquela-Parme.webp`)
- **`manifest-pedir.json`** — e-commerce
  - `name`: "Aquela Parmê — Pedir", `short_name`: "Pedir"
  - `id`/`start_url`: `/pedir?source=pwa`
  - `scope`: `/pedir`
  - `theme_color`: laranja iFood-like da marca
  - ícones: novos `/icons/pedir-192.png` e `/icons/pedir-512.png`

O `manifest.json` atual continua sendo o do **NEXA** (já está correto: nome "NEXA", scope `/`, ícone azul N) — usado quando o usuário entra pelo subdomínio `nexa.aquelaparme.com.br` ou pelo atalho `aquelaparme.com.br/nexa`.

### 2. Atualizar `src/components/pwa/RoleManifest.tsx`
Adicionar 2 regras novas no `ROLE_MAP` (a primeira que casar ganha):
- prefixo `/parme` → `manifest-parme.json` + theme vermelho + apple-icon Parmê
- prefixo `/pedir` → `manifest-pedir.json` + theme laranja + apple-icon Pedir

Assim, qualquer aba aberta em `aquelaparme.com.br/parme/...` mostra "Instalar Aquela Parmê", e em `pedir.aquelaparme.com.br/pedir/...` mostra "Instalar Pedir", sem afetar o NEXA.

### 3. Ajustar `index.html`
O `<title>` e meta atuais ("Aquela Parmê — comida com gosto de casa…") são do site Parmê, mas o `<link rel="manifest">` aponta pro manifest do NEXA. Como o `RoleManifest` já reescreve o manifest em runtime conforme a rota, o `index.html` continua válido — mas o `apple-touch-icon` fixo precisa virar dinâmico (o `RoleManifest` já cuida disso, só confirmar que o link inicial não trava o iOS antes do React montar).

### 4. `HostnameGuard` + `NexaEntry` (sem mudanças funcionais)
Já fazem o roteamento certo. Só validar que:
- `aquelaparme.com.br/` → `/parme` (pega manifest Parmê) ✅
- `aquelaparme.com.br/nexa` → marca sessionStorage e vai pra `/auth` (pega manifest NEXA) ✅
- `pedir.aquelaparme.com.br/` → `/pedir` (pega manifest Pedir) ✅

## Detalhes técnicos

- **Por que `id` distintos importam**: Chrome/Android usa `id` (fallback `start_url`) como chave única do app instalado. Sem `id` distinto, instalar o 2º sobrescreve o 1º.
- **iOS**: Safari não respeita `id`, mas usa `start_url`+`scope`+`apple-touch-icon` no momento do "Adicionar à Tela de Início". Como o `RoleManifest` troca o `apple-touch-icon` por rota, cada install pega o ícone certo. O usuário precisa abrir a rota correta antes de instalar (ex.: abrir `/pedir` antes de "Adicionar à Tela").
- **Sem service worker novo**: nada de offline; é manifest-only (mantém a regra de não mexer em SW em preview).
- **Ícones**: gerar 192/512 PNG para Parmê e Pedir via `imagegen` (premium se tiver texto, senão fast), salvar em `public/icons/`. Não usar `lovable-assets` (são ícones de manifest, precisam estar em `public/`).

## Arquivos tocados

- novo `public/manifest-parme.json`
- novo `public/manifest-pedir.json`
- novo `public/icons/parme-192.png`, `parme-512.png`
- novo `public/icons/pedir-192.png`, `pedir-512.png`
- editar `src/components/pwa/RoleManifest.tsx` (adicionar 2 entradas no ROLE_MAP)

Sem migration, sem mudança de backend, sem mexer no NEXA atual.

## Resultado

Usuário pode ter, lado a lado na home do celular:
1. Ícone **Aquela Parmê** (vermelho) → abre o site institucional em `/parme`
2. Ícone **NEXA** (N azul) → abre o app de gestão em `/`
3. Ícone **Pedir** (laranja) → abre o e-commerce em `/pedir`
