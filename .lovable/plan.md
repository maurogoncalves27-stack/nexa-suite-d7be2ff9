## Ajustes em /configuracoes/tef-paygo

### 1. Botão PIX → acquirer "PIX C6 BANK"
**Arquivo:** `src/components/tef-paygo/TefTestSaleCard.tsx`

- Atualizar `TefPaymentMethod` / tipo do parâmetro `acquirer` para aceitar `"PIX C6 BANK"` (além de `"DEMO"` e `"REDE"`).
  - Tipo local do estado `acquirer` passa a `"DEMO" | "REDE" | "PIX C6 BANK"`.
  - Assinatura do `runSale` aceita o novo valor.
- Trocar `runSale("pix", "REDE")` por `runSale("pix", "PIX C6 BANK")` no `onClick` do botão PIX.
- Verificar `paygoAdapter.ts` para garantir que o valor é repassado cru no campo `acquirer`/rede (se houver normalização para uppercase só, mantém; se houver allow-list, incluir `"PIX C6 BANK"`).

### 2. Roteiro de testes — remover tudo opcional
**Arquivo:** `src/components/tef-paygo/TefRoteiroTestesCard.tsx`

Remover do array `ROTEIRO` todo passo com `obrig` diferente de `"OBRIG"`:

- Passo 9 (OPC) — Recibos diferenciados #1
- Passos 13, 14, 15 (OPC) — Relatórios sintético/detalhado/resumido
- Passos 17, 18 (OPC) — Vendas para cancelar #1/#2
- Passos 22, 23 (OPC) — Cancelamentos #3/#4
- Seção 9 inteira (passos 39, 40 — AUTO, só totem)
- Seção 12 inteira (passos 47–50 — CTRL, só Web Service)
- Passo 36 (OPC) — Confirmação manual #2
- Passo 38 (OPC) — Desfazimento manual #2

Limpezas decorrentes:
- Remover do componente os tipos/labels não usados (`OPC`, `AUTO`, `CTRL` em `Obrig`, `OBRIG_LABEL`, `OBRIG_VARIANT`).
- Remover função/botão `toggleNA` e o estado `"na"` (só faz sentido para passos opcionais).
- Simplificar `Estado` para `Record<number, "done" | undefined>`.
- Ajustar títulos das seções que mudaram contagem (ex.: "1. Instalação e vendas básicas (1–8)" continua; "2. Recibos diferenciados e QR Code PIX C6 (10–11)"; "3. Comunicação e relatórios (12, 16)"; "4. Vendas para teste de cancelamento (19, 21)"; "7. Transação pendente e confirmação (31–35)"; "8. Desfazimento (37)"; renumerar seções 9/10/11/12/13 → 9. Cancelamento por referência; 10. Contactless; 11. Queda após aprovação e QR Code finais).
- Atualizar `STORAGE_KEY` para `tef-paygo-roteiro-obrig-v1` (evita carregar estado antigo com passos removidos).
- Como todos os passos restantes são OBRIG, o `Badge` de obrigatoriedade pode ser removido para enxugar a UI (opcional dentro do plano — manter por padrão, mas todos iguais).

### Não tocar
- Lógica do hook PayGo, dialog de seleção de rede, recibos, logging.
- Demais cards da página.
