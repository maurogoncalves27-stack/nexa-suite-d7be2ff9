## Objetivo

No CRM, o telefone do cliente deixa de ser texto e passa a ser um link que abre a conversa no WhatsApp, para responder o cliente com 1 clique.

## O que muda

1. **Lista de Atendimento (coluna "Contato")** — o número passa a ser clicável, abre o WhatsApp Web/app já na conversa daquele número. Ícone do WhatsApp ao lado para deixar claro que é clicável.
2. **Modal da conversa** — o telefone mostrado no cabeçalho também vira link.
3. **Reservas / chamados** — onde o contato aparece, mesmo tratamento.
4. Clicar no telefone **não abre** a conversa (o clique não propaga para a linha da tabela).
5. Quando não há telefone, continua exibindo "—" sem link.

## Detalhes técnicos

- Novo helper `waLink(digits)` em `src/pages/CRM.tsx`: normaliza os dígitos, prefixa `55` quando o número vier sem DDI (10–11 dígitos) e devolve `https://wa.me/<numero>`.
- Novo componente local `PhoneLink` renderizando `<a href={waLink(...)} target="_blank" rel="noopener noreferrer">` com o número formatado por `fmtPhone` + ícone, usando tokens do design system (`text-primary hover:underline`), sem cor hardcoded.
- Substituir as ocorrências de exibição de telefone (linha ~1342 da tabela de conversas, ~1415 no modal e a coluna "Contato" da tabela de reservas/chamados ~1078) por `<PhoneLink digits={phoneDigits} />`.
- `onClick={(e) => e.stopPropagation()}` na célula do telefone.
- Sem mudança de banco nem de edge function.
