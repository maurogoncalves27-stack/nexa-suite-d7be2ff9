---
name: Nomes de teste Giana
description: Padrão de nome usado em testes manuais da Giana (chat/WhatsApp/reservas) para facilitar limpeza
type: preference
---
Em testes manuais da Giana (chat, WhatsApp Cliente, reservas, tickets), o nome do cliente sempre será "Teste", "teste1", "teste2", "teste3"... (case-insensitive).

**How to apply:** ao limpar/filtrar dados de teste, usar `name ILIKE 'teste%'` (ou contact/title equivalente). Bateria automatizada antiga usou nome "Gustavo" + telefones `619999000x` — também são teste e podem ser removidos.
