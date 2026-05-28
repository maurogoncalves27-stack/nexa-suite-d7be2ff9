## Badge de marca nos pedidos (/loja)

Adicionar um badge colorido identificando a marca (AQUELA PARMÊ / ESTROGONOFE / BOX CAIPIRA) nos cards de pedido e no modal de detalhe, usando a paleta fixa de marcas.

### Cores (HSL via tokens, sem hardcoded Tailwind)

Adicionar tokens em `src/index.css` (`:root` e `.dark`) e mapear em `tailwind.config.ts`:

- `--brand-parme`: vermelho (`0 71% 42%`) / fg branco
- `--brand-estrogonofe`: marrom (`24 45% 32%`) / fg branco
- `--brand-box`: laranja (`24 90% 50%`) / fg branco

No `tailwind.config.ts`, adicionar `colors.brand.parme`, `colors.brand.estrogonofe`, `colors.brand.box` apontando para os tokens.

### Helper

Em `src/pages/PdvNovo.tsx`, criar `brandFromStoreName(storeName?: string)` que retorna `{ label, className } | null`:

- contém "PARMÊ" / "PARME" → `{ label: "AQUELA PARMÊ", className: "bg-brand-parme text-brand-parme-foreground" }`
- contém "ESTROGONOFE" → `{ label: "ESTROGONOFE", className: "bg-brand-estrogonofe text-brand-estrogonofe-foreground" }`
- contém "BOX" → `{ label: "BOX CAIPIRA", className: "bg-brand-box text-brand-box-foreground" }`
- caso contrário: `null` (não renderiza badge)

### Onde renderizar

1. **Card de pedido ativo** (área amarela/laranja) — badge ao lado do nº do pedido.
2. **Card concluído** (verde) — mesmo lugar.
3. **Card cancelado** (vermelho) — mesmo lugar.
4. **Modal de detalhe** (`DialogTitle`) — badge ao lado do chip `iFood / Totem / Salão`.

Usar `<Badge>` do shadcn com `className` do helper. Não renderizar nada quando `brandFromStoreName` retorna `null` (lojas sem marca identificável, ex.: Fábrica).

### Fora do escopo

- Receita impressa (`src/lib/printOrder.ts`) — sem alterações; o nome da loja já vai no ticket.
- Backend, edge functions, schema — sem alterações.

### Arquivos alterados

- `src/index.css` — 3 tokens novos (light + dark)
- `tailwind.config.ts` — namespace `brand`
- `src/pages/PdvNovo.tsx` — helper + badges nos 3 cards + modal
