## Problema

Mesmo com regras "críticas" no prompt, a Giana continua inventando peso (500g) e nº de pessoas (3) da Parmegiana Família. O modelo atual é `google/gemini-3-flash-preview` (preview, mais fraco) e o único guard-rail real hoje é o de **preço** (`PRICE_REGEX` reescreve a resposta). Peso/porções ficam só na base do prompt — que o modelo ignora.

## O que fazer

Três camadas, na ordem de eficácia:

### 1. Hard-guard de fatos canônicos (igual ao guard de preço)
Em `supabase/functions/parme-chat/index.ts`, adicionar sanitizador que roda no stream e no persistido:

- Detecta menção a Parmegiana Família + número de pessoas ≠ 4 (`/fam[ií]lia[^.]{0,80}?(?:\b([123]|cinco|seis)\b\s*pessoas|at[eé]\s*3)/i`) → substitui pela frase canônica: *"Nossa Parmegiana Família serve 4 pessoas (2400g no total, 150g de proteína por pessoa) 😊"*.
- Detecta peso de parmegiana com valor fora da tabela oficial (600/1200/2400g) → mesma substituição.
- Mesma abordagem para Casal (2 pessoas / 1200g) e Individual (1 / 600g).
- Aplicar no `wrapSseWithPriceGuard` (renomear para `wrapSseWithFactGuard`) e no ponto de persistência final da mensagem do assistente.

Isso garante que **o cliente nunca mais vê** um número errado, mesmo se o modelo tentar.

### 2. Trocar o modelo
`google/gemini-3-flash-preview` → `google/gemini-3.6-flash` (default recomendado, mais estável) na linha 707. Sem custo extra relevante, segue as regras do prompt melhor.

### 3. Baixar a "criatividade"
Passar `temperature: 0.3` no `streamText` (hoje usa default ~0.7). Menos improviso = menos invenção.

## Fora do escopo

- Não mexer em tools, cardápio, fluxo de reserva, iFood, dedup de mensagens.
- Não tocar em Z-API / webhook.
- Não adicionar UI nova.

## Detalhes técnicos

Arquivo único alterado: `supabase/functions/parme-chat/index.ts`.
Deploy automático pelo Lovable Cloud após o edit.
Testes manuais sugeridos depois do deploy:
1. "Quanto pesa a parmegiana família?" → deve responder 2400g.
2. "Serve quantas pessoas?" → deve responder 4.
3. "E a de casal?" → 2 pessoas / 1200g.

Se o modelo ainda escapar em algum caso, o guard reescreve antes de chegar no cliente.
