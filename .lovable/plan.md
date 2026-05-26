# NEXA Smart POS — Caminho Rápido

## Decisão travada
- **Hardware alvo:** Stone S920 / Ton T3 (mesma família, mesmo SDK PlugPag)
- **Por quê é o mais rápido:** SDK PlugPag é aberto e documentado publicamente, sem NDA. Aceita APK próprio sem burocracia. Homologação TEF em ~30 dias. Impressora térmica integrada com API simples.
- **Fase 1 (agora):** construir só o shell visual web em `/smartpos`, com TEF mockado, rodando no navegador. Sem Capacitor, sem APK, sem maquininha.
- **Fase 2 (depois do iFood homologar):** empacotar como APK Capacitor, integrar PlugPag (Stone/Ton), instalar via USB na maquininha.

## O que será construído nesta fase

### Rota e layout
- Nova rota `/smartpos` (pública, login dedicado igual ao /pdv-novo)
- Viewport alvo fixo: **480×800** (tela típica Cielo LIO V3)
- Layout single-screen, sem sidebar, botões grandes (mín. 48px), tipografia legível à distância de braço

### Telas
1. **Login Smart POS** — email/senha, seleção de loja (só Asa Sul, Asa Norte, Águas Claras, Lago Sul — sem Fábrica)
2. **Home / Catálogo** — grid de categorias (`pdv_categories`) → grid de produtos (`pdv_products`)
3. **Carrinho lateral/inferior** — itens, quantidade, subtotal
4. **Tela de cobrança** — total + botão "Cobrar" (mock: simula aprovação após 2s)
5. **Comprovante** — tela de sucesso com resumo (impressão mockada)

### Reaproveitamento
- Reusa `pdv_categories`, `pdv_products`, `pdv_sales` (já existem)
- Reusa design system NEXA (tokens, cabeçalho padrão adaptado pra mobile)
- TEF: cria `src/lib/tef/smartPosTefAdapter.ts` retornando mock aprovado (mesma interface do adapter SiTef futuro)

### O que NÃO entra agora
- Capacitor / APK / build Android
- SDK Cielo / Stone / PlugPag
- Integração TEF real
- Impressora térmica nativa
- NFC-e (vem na Fase 3)
- Sincronização offline
- Mexer em `/pdv`, `/pdv-novo`, `pos_*`, SiTef, Gertec, iFood (tudo congelado pela regra de prioridade)

## Detalhes técnicos

### Arquivos novos
```
src/pages/SmartPos.tsx              # Shell + roteamento interno
src/pages/SmartPosLogin.tsx         # Login dedicado
src/components/smartpos/
  ├─ Catalog.tsx                    # Categorias + produtos
  ├─ Cart.tsx                       # Carrinho
  ├─ ChargeScreen.tsx               # Tela de cobrança
  └─ Receipt.tsx                    # Comprovante
src/lib/tef/smartPosTefAdapter.ts   # Mock TEF (interface única)
src/hooks/useSmartPosCart.ts        # Estado do carrinho
```

### Alterações pontuais
- `src/App.tsx`: adicionar rotas `/smartpos` e `/smartpos/login` (fora do AppLayout)
- `src/components/AppLayout.tsx`: adicionar PAGE_TITLES `/smartpos`
- Sem migrations (Fase 1 só lê tabelas existentes)

### Mock TEF (interface)
```ts
export interface TefAdapter {
  charge(amountCents: number, method: 'credit'|'debit'|'pix'): Promise<TefResult>;
}
// Fase 1: smartPosTefAdapter → resolve após 2s com status='approved'
// Fase 2: trocar implementação por Cielo SDK sem mudar quem chama
```

## Roadmap pós-Fase 1 (só pra contexto, NÃO executar agora)

| Fase | Quando | O quê |
|------|--------|-------|
| 2 | Após iFood homologar | Empacotar com Capacitor, publicar na Cielo Store via Infinity Pay |
| 3 | Após Fase 2 estável | TEF real Cielo + impressora térmica nativa |
| 4 | Após Fase 3 | NFC-e via Focus NFe, sync `pdv_sales`, modo offline |

## Critério de aceite Fase 1
- Acessar `/smartpos` no navegador (PC ou celular) e ver tela 480×800 funcional
- Logar com qualquer usuário existente, escolher loja
- Navegar categorias → produtos → adicionar ao carrinho
- Clicar "Cobrar" → mock aprovado → tela de comprovante
- Voltar pro catálogo e iniciar nova venda
- Zero alteração em `/pdv`, `/pdv-novo`, iFood ou qualquer fluxo de produção
