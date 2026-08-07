# Código Yolo no NEXA Garçom

O fluxo de código Yolo já funciona no Totem e no site (/pedir). Este plano leva o mesmo fluxo para o NEXA Garçom (SmartPOS), com desbloqueio válido apenas para o pedido atual.

## Como vai funcionar

1. Na tela de pedido da mesa (aba de cardápio), aparece um botão "Código Yolo" quando ainda não houve validação.
2. O garçom toca no botão, digita os 6 dígitos informados pelo cliente e confirma.
3. O sistema valida e consome o código na Yolo. Se der certo, as categorias exclusivas Yolo passam a aparecer no cardápio do garçom, respeitando a janela de dia/horário configurada para aquela loja.
4. Se o código for inválido, já usado ou a integração da loja estiver desligada, o modal mostra a mensagem de erro e nada é liberado.
5. O desbloqueio vale só para a rodada atual: ao enviar a rodada para a cozinha, trocar de mesa, sair da sessão ou trocar de loja, a categoria Yolo volta a ficar oculta e é preciso um novo código.

## Detalhes técnicos

Arquivo principal: `src/pages/Garcom.tsx`.

- Reutilizar o componente existente `src/components/yolo/YoloCodeDialog.tsx` com `channel="garcom"` e o `storeId` selecionado. Nenhuma mudança de banco ou edge function é necessária (`yolo-validate` / `yolo-redeem` já atendem esse canal).
- Novo estado `yoloUnlocked` (boolean) + `yoloDialogOpen`.
- Passar `yoloUnlocked` para `loadMenuCatalog(storeId, null, { channel: "garcom", yoloUnlocked })` e incluir a flag nas dependências do `useEffect` que carrega o cardápio, para o catálogo recarregar após a validação.
- Resetar `yoloUnlocked` para `false` em: envio da rodada, `confirmOpenTable`, `enterTable`, retorno para a tela de mesas e troca de `storeId`.
- Botão "Código Yolo" (ícone `Ticket`, tokens do design system, `variant="outline"`) posicionado no cabeçalho da lista de categorias da tela de sessão, exibido apenas quando `!yoloUnlocked`; quando desbloqueado, mostrar um badge "Yolo liberado".
- Layout mobile-first (o Garçom roda na GPOS780): botão em largura total no mobile.
