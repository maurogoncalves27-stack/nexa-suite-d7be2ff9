## Problema

Na página **Vale Transporte** os grupos por escala têm tom visual definido em `src/components/payroll/TransportVoucherPanel.tsx` (`scheduleTone`), mas:

- **5x2** usa `bg-secondary/60` — fica praticamente igual ao fundo da tabela, quase sem diferenciação.
- **Híbrido (Home Office + Presencial)** não é reconhecido pela função `scheduleGroupLabel` nem por `scheduleTone`, então cai no fallback neutro (`bg-muted/40`), idêntico ao "sem jornada".

Resultado: só 6x1 (verde claro) e 12x36 (amarelo) aparecem com cor; 5x2 e Híbrido parecem "sem cor".

## Mudança

Apenas visual, em **um único arquivo**: `src/components/payroll/TransportVoucherPanel.tsx`.

1. **`scheduleGroupLabel`**: passar a reconhecer `hibrid`/`híbrid`/`home office` e devolver `"Escala Híbrida"`.
2. **`scheduleTone`**: dar tons mais visíveis e únicos para cada escala, usando exclusivamente tokens do design system (sem cores hardcoded):
   - 12x36 → `warning` (mantém amarelo, como hoje)
   - 6x1 → `success` (verde — mais forte que o `accent/40` atual e bate com a percepção do print)
   - 5x2 → `primary` (azul claro do tema, com `/15` no header e borda esquerda `primary`)
   - Híbrida → `info` se existir, senão `accent` com tom mais saturado (`bg-accent/60` + borda `accent`)
   - Fallback "sem jornada" → continua `muted`
3. **Ordem de agrupamento** (`order` na linha 380): incluir `"Escala Híbrida"` após `"Escala 5x2"` para o grupo aparecer sempre na mesma posição.

## Fora de escopo

- Não mexer em cálculo de VT, % de desconto, edge function `calculate-payroll`, nem na tabela de pagamentos mensais.
- Não alterar outras páginas (Folha, Bonificações etc.).
- Sem mudança de schema.

## Verificação

Abrir `/vale-transporte` e conferir que os 4 grupos (12x36, 6x1, 5x2, Híbrida) aparecem com cores de cabeçalho e borda lateral distintas, em ambos os temas (claro/escuro).
