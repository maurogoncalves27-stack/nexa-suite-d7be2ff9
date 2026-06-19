# Clone do aquelaparme.com.br no Lovable

## Decisões já tomadas
- **Projeto separado** (não mexe na NEXA Suite).
- **Publicar primeiro em subdomínio de teste** (ex: `novo.aquelaparme.com.br`); WordPress atual continua no ar até você aprovar.
- **Escopo completo**: home + páginas internas das 3 marcas + popups + animações.

## Como começar (você precisa fazer 1 passo)
Este plano não roda neste projeto (NEXA). Você precisa criar o projeto novo:

1. Vá em **Dashboard Lovable → New Project** (em branco).
2. Nomeie algo tipo **"aquelaparme-site"**.
3. Abra o projeto novo, cole esta mensagem no chat e me peça pra executar este plano lá:
   > "Executa o plano clone-aquelaparme: clonar 100% de aquelaparme.com.br, mesmo design, fontes, cores, imagens, popups e animações."

A partir daí, no projeto novo, eu executo os passos abaixo.

---

## O que vou fazer no projeto novo

### Fase 1 — Coleta (1 turno)
- Fetch das 5 URLs: `/`, `/aquela-parme`, `/aquele-estrogonofe`, `/box-caipira`, `/sobre`.
- Baixar via `curl` **todos os `.webp/.png/.svg`** do site (logo, pratos, estrelas, círculos decorativos, selos das marcas, backgrounds) — estão todos em `aquelaparme.com.br/wp-content/uploads/2025/12/`.
- Subir as imagens como **Lovable Assets** (CDN), pra não depender do WordPress ficar no ar.
- Extrair as **fontes reais** do CSS do Elementor (a serifa do "Aquela Parmê" parece **Recoleta** ou similar; vou identificar e usar `@fontsource` equivalente ou Adobe Fonts se for proprietária).

### Fase 2 — Design system (1 turno)
- `tailwind.config.ts` + `index.css` com os tokens já mapeados:
  - Creme `#fbf3e1`, Vermelho `#7a1416`, Laranja-tomate `#e6532a`, Marrom `#5a3a28`, Ink `#1a1410`.
  - Tokens semânticos (`--ap-cream`, `--ap-red`, etc.) — sem cor hardcoded.
- Componentes base: `ApHeader` (pílula preta flutuante), `ApFooter` (laranja com "drip" preto), `ApButton` (creme + ícone seta arredondada), `ApCard`, `ApDisplay` (serifa).

### Fase 3 — Páginas (2-3 turnos)
- **Home** (`/`): header + 3 cards grandes (Aquela Parmê vermelho, Box Caipira laranja, Estrogonofe marrom/bege) com pratos + estrelas decorativas rotacionadas + selos das marcas. Carrossel auto em mobile.
- **/aquela-parme**, **/aquele-estrogonofe**, **/box-caipira**: páginas individuais com hero, história, galeria, CTA iFood.
- **/sobre**: institucional.

### Fase 4 — Interações
- **Lenis** (smooth scroll) — `npm i @studio-freight/lenis`.
- **Framer Motion** pros `fadeIn` no scroll (Elementor usa `animated fadeIn`).
- **Popups**: "Trabalhe Conosco" → link pra `nexa.aquelaparme.com.br/vagas` (reaproveita o portal de vagas que já existe na NEXA). "iFood" → modal com cards das 4 lojas linkando pros respectivos cardápios iFood.

### Fase 5 — SEO + Publicação
- `index.html` com title, meta description, OG tags, favicon (logo Aquela Parmê).
- `robots.txt` + `sitemap.xml`.
- Publicar via Lovable → URL `aquelaparme-site.lovable.app`.
- Você adiciona o subdomínio **`novo.aquelaparme.com.br`** no painel do registrador (CNAME ou A `185.158.133.1` + TXT `_lovable`). Eu te passo os valores exatos.

### Fase 6 — Cutover (quando você aprovar)
- Você troca o A record do `aquelaparme.com.br` (apex) pra apontar pro Lovable.
- WordPress sai do ar. Sem volta automática — recomendo backup do WP antes (export XML pelo `/wp-admin`).

---

## Detalhes técnicos
- **Stack**: React 18 + Vite + Tailwind + shadcn (padrão Lovable).
- **Fontes**: `@fontsource` (sem `<link>` no HTML, sem `@import` no CSS).
- **Imagens**: todas via `.asset.json` no CDN Lovable (zero binário no repo).
- **Animações**: Framer Motion (`whileInView`) + Lenis pro scroll.
- **Sem backend**: site institucional é 100% estático. "Trabalhe conosco" reaproveita backend NEXA (link externo).

## O que NÃO está incluído
- Painel admin de conteúdo (tipo WordPress). Conteúdo fica versionado no código — mudanças = nova publicação.
- Migração de posts/blog (o site atual não tem blog visível).
- Integração de iFood real (apenas links externos pros 4 cardápios).

## Riscos
- **Fontes proprietárias** (Recoleta): se for paga, vou usar substituta open-source visualmente próxima (DM Serif Display ou Fraunces) e te avisar.
- **Cutover de DNS**: 1-72h de propagação; subdomínio de teste evita downtime no domínio principal.

Aprova pra eu seguir? Quando aprovar, te passo os 3 cliques pra criar o projeto novo.
