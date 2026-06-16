Plano para corrigir o PIX no PayGo/PPC930:

1. Corrigir o tipo de pagamento PIX no bridge
- Hoje o agente envia `method = "PIX"`, mas o `paygo-bridge.ps1` só ativa PIX quando recebe `"PIX_TEF"`.
- Vou ajustar para aceitar `PIX` e `PIX_TEF`, enviando `PWINFO_PAYMNTTYPE = 8` corretamente.
- Isso é o principal suspeito: a tela pisca porque a transação entra, mas o PayGo pode não estar configurando o fluxo Pix de verdade.

2. Ajustar preferência de QR para pinpad + PC
- Manter o suporte ao QR na tela do PC como fallback.
- Ajustar o comentário e o estado para não assumir mais que o PPC930 não tem display.
- Preservar `PWINFO_DSPQRPREF`, mas deixar explícito no código que o objetivo é permitir QR no pinpad e espelho na automação.

3. Reforçar log do evento `PWDAT_DSPQRCODE`
- Quando o PayGo pedir exibição do QR, registrar identificador, tamanho do payload e mensagem de diagnóstico.
- Não expor dados sensíveis além do necessário; o BR Code só seguirá para a UI porque é necessário para renderização fallback.

4. Subir versão do agente
- Atualizar `electron-acbr/package.json` de `1.5.6` para `1.5.7`, pois é uma correção real depois da 1.5.6.

5. Resultado esperado no reteste
- Rebuild do agente.
- No Passo 11 PIX C6 BANK, o PPC930 deve sair da tela branca e exibir o QR Code.
- Se ainda não exibir no pinpad, a tela do PC deve receber o BR Code e mostrar o modal, e os logs vão indicar se a DLL gerou `PWDAT_DSPQRCODE`.