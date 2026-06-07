---
name: KDS descartado — comanda em papel
description: KDS fora do escopo; pedidos do PDV imprimem comanda em papel na mesma impressora da NFC-e
type: feature
---

**Diretriz atual (07/06/2026):** Sem Kitchen Display System. A cozinha recebe **comanda impressa em papel** na **mesma impressora térmica do PDV** que emite a NFC-e (Gertec G250 80mm e similares).

- Não construir telas KDS, não criar rotas `/kds`, não usar `pdv_order_events` para alimentar display.
- Cada pedido confirmado no `/pdv-novo` (e canais integrados: iFood, Totem, WhatsApp futuro) deve disparar **impressão de comanda** no `printer:printUrl` configurado da loja.
- Layout da comanda: cabeçalho (loja, nº pedido, canal, hora), itens com quantidade e observações, separador, rodapé curto. Sem preços de itens (comanda de produção).
- Reimpressão manual disponível na tela do pedido.
- Se no futuro o usuário pedir KDS de novo, reabrir esta diretriz explicitamente.
