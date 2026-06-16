Vou ajustar o fluxo PIX do agente PayGo para ficar alinhado ao exemplo oficial C# que você enviou.

Pontos encontrados na comparação:
- A demo oficial usa `PWINFO_AUTCAP = 128 + 256 = 384`; nosso agente está usando `452`, com capacidades extras.
- A demo oficial usa `PWINFO_DSPQRPREF = 2`, ou seja, QR Code no checkout/tela do PC.
- O mais importante: no `PWDAT_DSPQRCODE`, a demo NÃO lê o QR de `szValorInicial`. Ela chama `PW_iGetResult(PWINFO_AUTHPOSQRCODE = 0x1F77)` e depois responde `PW_iAddParam(wIdentificador, "")`.
- Nosso código hoje está pegando `data.szValorInicial`, emitindo esse valor e devolvendo esse mesmo valor no `PW_iAddParam`; isso diverge da demo e explica o timeout sem modal/QR.

Plano de implementação:
1. Em `electron-acbr/scripts/paygo-bridge.ps1`, adicionar a constante `PWINFO_AUTHPOSQRCODE = 0x1F77`.
2. Trocar o tratamento de `PWDAT_DSPQRCODE` para:
   - chamar `Result(PWINFO_AUTHPOSQRCODE)` para obter o BR Code real;
   - emitir evento `QRCODE` com esse conteúdo para o modal no PC;
   - chamar `PW_iAddParam(data.wIdentificador, "")`, igual à demo oficial.
3. Alinhar `PWINFO_AUTCAP` da venda/admin/install para `384`, igual à demo oficial: checkout display + QR checkout.
4. Manter `PWINFO_DSPQRPREF = 2`, porque a própria documentação diz que `2` é exibir no checkout/PC; se quisermos testar pinpad depois, será um teste separado com valor `1`.
5. Atualizar mensagens/comentários da tela de teste para parar de dizer que o PPC930 não tem display gráfico e deixar claro que o QR do PC é o fallback oficial do checkout.
6. Subir versão do agente para `1.5.8`, para você conseguir confirmar que gerou a versão certa.

Resultado esperado:
- Na próxima venda PIX, se a DLL gerar `PWDAT_DSPQRCODE`, o agente deve receber o BR Code por `PWINFO_AUTHPOSQRCODE` e abrir o modal/QR no PC.
- Se ainda não aparecer no pinpad, isso passa a ser comportamento/configuração do PayGo/PdC, mas o fluxo do PC estará igual ao exemplo oficial.