# Fix: Diálogo de assinatura cortado no mobile

## Problema
Em `src/components/auth/SignatureSetupDialog.tsx`, o `DialogContent` não limita altura nem habilita scroll. No viewport ~350x616 (mobile), o conteúdo (título + pad de assinatura 180px + termo + checkbox + aviso + footer) ultrapassa a tela e o botão "Salvar assinatura" fica escondido sem possibilidade de rolar.

## Mudança (somente UI, 1 arquivo)

`src/components/auth/SignatureSetupDialog.tsx`:

1. **DialogContent**: adicionar `max-h-[90vh] flex flex-col p-0 gap-0` para virar coluna flexível com altura limitada.
2. **DialogHeader**: envolver em wrapper com `p-6 pb-2 shrink-0` (fixo no topo).
3. **Bloco do meio** (pad + termo + checkbox + aviso): envolver em `<div className="flex-1 overflow-y-auto px-6 py-2 space-y-3">` — área rolável.
4. **DialogFooter**: adicionar `p-6 pt-3 shrink-0 border-t bg-background` (fixo no fundo, sempre visível).
5. Reduzir altura do `SignaturePad` para `140` no mobile mantendo usabilidade (ou manter 180 já que agora rola — manter 180).

## Fora de escopo
- Não mexer em `EnsureUserSignature`, lógica de assinatura, ou outros diálogos.
- Sem mudanças de backend, schema ou regras.
