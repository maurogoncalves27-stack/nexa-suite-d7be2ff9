O QR que apareceu provavelmente é da venda nova, porque antes o app nem recebia BR Code. Agora sabemos: o host/Pix está gerando QR; o que falha é a conclusão por timeout e a exibição no pinpad.

Plano de correção:

1. Não tratar “tempo de captura excedido” como erro seco quando já existe QR
   - Se o agente recebeu `PWDAT_DSPQRCODE` e emitiu `QRCODE`, manter o modal aberto como “aguardando pagamento” em vez de parecer transação perdida.
   - Mostrar no modal que o QR foi gerado e que o cliente pode pagar pelo QR do PC.

2. Adicionar log de correlação da venda
   - Incluir `SaleId`, valor e horário nos eventos do QR.
   - Assim fica claro se o QR é da tentativa atual ou anterior.

3. Testar preferência de QR no pinpad
   - Criar uma variação configurável de `PWINFO_DSPQRPREF`:
     - `2` = checkout/PC, que já gerou QR.
     - `1` = pinpad, para testar PPC930.
   - Deixar padrão em `2`, porque é o caminho que já funcionou.

4. Confirmar pela documentação PayGo
   - `PWINFO_DSPQRPREF=1` força pinpad; `2` força checkout/PC.
   - A própria documentação diz que só exibe no pinpad se automação e pinpad suportarem; portanto, se `1` não aparecer, não é mais problema do Pix em si.

5. Gerar versão `1.5.9`
   - Agente com logs melhores, preferência configurável e mensagem mais clara no modal.
   - Depois testar duas vendas de R$ 1,00: uma com PC (`2`) e uma com pinpad (`1`).

Minha leitura: o QR não é “fantasma”; o Pix passou a gerar. O próximo gargalo é que o PayGo está expirando antes da baixa/consulta da transação, e o PPC930 talvez não suporte/esteja configurado para exibir QR apesar de aceitar cartão.