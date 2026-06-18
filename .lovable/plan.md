
# Corrigir botão "Agendar compromisso por voz"

## Diagnóstico

O toast **"Failed to send a request to the Edge Function"** acontece porque a edge function `parse-appointment-voice` **nunca foi efetivamente deployada** — os logs dela estão vazios, enquanto `transcribe-audio` aparece bootando normalmente. O código da função existe (`supabase/functions/parse-appointment-voice/index.ts`) e está correto, só precisa subir.

## Ação

1. Fazer o deploy explícito da function `parse-appointment-voice`.
2. Testar com um payload pequeno via curl pra confirmar que responde 200 e devolve o JSON esperado.
3. Pedir pro usuário gravar de novo no botão flutuante.

Sem alteração de código — apenas deploy + verificação.

## Se ainda falhar depois do deploy

Plano B (em ordem):
- Conferir se `LOVABLE_API_KEY` está presente (deveria estar — `transcribe-audio` usa a mesma).
- Conferir `requireRole(["admin","manager","hr"])` — usuário precisa ter um desses papéis; se for super-user só, ajustar a função pra aceitar super-user também.
