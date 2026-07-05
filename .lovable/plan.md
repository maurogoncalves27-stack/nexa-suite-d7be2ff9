## O que vou construir

Uma página única de comparativo entre lojas reunindo o que já é lançado hoje — **sem cadastro novo, sem tabelas novas, sem migração**. Só leitura e agregação.

### Onde fica
- Novo item no sidebar, no grupo **Operação**: **"Consumo x Faturamento"** (ícone `Gauge` ou `BarChart3`).
- Rota: `/consumo-lojas`.
- Adiciono em `PAGE_TITLES` (AppLayout) e no `AppSidebar`.

### Layout (mobile-first, cabeçalho padrão)

```text
┌─────────────────────────────────────────┐
│ [Ícone] Consumo x Faturamento           │
│ Compare consumo e faturamento por loja. │
├─────────────────────────────────────────┤
│ [Filtro período: mês/ano ▾]  [Loja ▾]   │
├─────────────────────────────────────────┤
│ Tabela comparativa                      │
│  Loja | Fatur. | Água R$ | Luz R$ |     │
│       | %fat   | %fat    | %fat   |     │
│       | Gás(btj+R$) | Óleo(#trocas)     │
├─────────────────────────────────────────┤
│ Gráfico barras: % consumo / faturamento │
│ por loja (uma barra por insumo)         │
└─────────────────────────────────────────┘
```

Cores de loja seguem a paleta fixa (Asa Norte verde, Águas Claras azul, Asa Sul amarelo, Lago Sul rosa). Nada de cores hardcoded — só tokens do design system.

### De onde vem cada dado (nada é criado)

| Insumo | Fonte | Métrica exibida |
|---|---|---|
| **Faturamento** | `monthly_revenue` (agrupado por store_id no mês) | R$ bruto |
| **Água** | `accounts_payable` filtrando `category_id = 3e964f5d…` (Água e esgoto), somando `amount` por `store_id` × mês da `competence_date` | R$ e % do faturamento |
| **Luz** | idem, categoria `5f5803ab…` (Energia elétrica) | R$ e % do faturamento |
| **Gás** | `gas_voucher_purchases` (soma `total_amount` e `quantity` de botijões) casada via `gas_voucher_requests.purchase_id → store_id` no mês; + categoria financeira `Gás`/`Vale Gás` como fallback | R$, nº de botijões, % do faturamento |
| **Óleo** | `nutri_oil_quality_records` filtrando `changed=true`, agrupado por `store_id` e `date` no mês | Nº de trocas de fritadeira |

Só lojas físicas (`stores.is_virtual=false`) e sem Fábrica/Estoque Central, seguindo a regra do projeto.

### Interações
- Filtro de **período**: mês/ano (padrão = mês atual). Opção "últimos 3 meses" para ver tendência.
- Filtro de **loja**: todas ou uma específica.
- Toggle **R$ absoluto** ↔ **% do faturamento** na tabela.
- Botão **Exportar CSV** da tabela.

### O que fica fora deste plano
- Nenhuma tela de cadastro nova (leituras de m³/kWh continuam fora — usamos só R$).
- Nenhum alerta/limite (podemos adicionar depois se você quiser).
- Nenhuma mudança em NutriControle, Financeiro ou Vale Gás — só leitura.

### Arquivos afetados

- **Novo**: `src/pages/ConsumoLojas.tsx` (página).
- **Novo**: `src/components/consumo/ConsumoTable.tsx` e `ConsumoChart.tsx` (opcional, para manter arquivos pequenos).
- **Editar**: `src/App.tsx` (rota), `src/components/AppSidebar.tsx` (item no grupo Operação), `src/components/AppLayout.tsx` (PAGE_TITLES).

Se aprovar, implemento direto — nenhuma migração de banco envolvida.
