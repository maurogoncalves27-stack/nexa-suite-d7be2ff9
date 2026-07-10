
UPDATE public.occurrences
SET
  requires_subcategory = true,
  subcategory_options = ARRAY[
    'Pedido ainda não saiu para entrega',
    'Pedido pronto ou em rota de entrega'
  ]::text[],
  action = 'NUNCA aceitar Pix por fora (regra iFood - risco de bloqueio da loja). Se o pedido ainda NÃO saiu: orientar o cliente a cancelar no app dele e refazer com o item incluído. Se JÁ está pronto/em rota: orientar o cliente a fazer um NOVO pedido no iFood só com o item esquecido, na modalidade RETIRAR na loja, e avisar no chat que sairá junto com o pedido principal no mesmo motoboy.',
  message = 'Olá! Entendemos perfeitamente. Como o pedido já foi fechado no sistema do iFood, não conseguimos alterar o valor nem a nota fiscal, e por regra da plataforma não podemos aceitar Pix por fora. Para te ajudar rapidinho: faça um pedido novo no iFood só com o item que faltou, escolha a opção RETIRAR NA LOJA, e nós enviamos tudo junto no mesmo motoboy. 🛵',
  prevention_1 = 'Registrar no grupo da unidade o pedido complementar para casar as duas entregas',
  prevention_2 = 'Se o cliente insistir em Pix por fora, recusar educadamente e orientar a abrir chamado no Portal do Parceiro iFood',
  updated_at = now()
WHERE code = 'D12';
