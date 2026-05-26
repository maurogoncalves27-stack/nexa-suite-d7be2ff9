## Corrigir import CORS da edge function auto-remind-pending-docs

### Contexto
A edge function `auto-remind-pending-docs` tem um import inválido na linha 6:
```ts
import { corsHeaders } from "@supabase/supabase-js/cors"
```
Esse subpath não existe no pacote `@supabase/supabase-js`, o que impede o deploy de edge functions e bloqueia o remix do projeto.

### Passos
1. **Corrigir o import** em `supabase/functions/auto-remind-pending-docs/index.ts`:
   - Substituir o `createClient` e `corsHeaders` imports pelo padrão `npm:` specifier recomendado:
     ```ts
     import { createClient } from 'npm:@supabase/supabase-js@2';
     import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
     ```
2. **Deploy da edge function** `auto-remind-pending-docs` para validar que o build passa.

### Escopo de impacto
Zero impacto operacional. Essa edge function é um cron de RH (cobrança automática de documentos pendentes de candidatos). Não afeta PDV, iFood, TEF, NFC-e, totem, folha, ponto, escala, estoque, nem nenhum módulo crítico.

### Validacao
Após o deploy, confirmar que não há erro de build no console.