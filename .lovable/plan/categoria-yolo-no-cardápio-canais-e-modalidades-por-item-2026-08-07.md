# Categoria Yolo no cardápio + canais e modalidades por item

Cardápio continua único. O que muda: cada item passa a dizer **onde** aparece (canais) e **em qual modalidade** (entrega/retirada), e ganha uma categoria especial **Yolo**, que só fica visível depois que o cliente valida o código Yolo e apenas nos dias/horários configurados por loja.

## 1. Canais e modalidades por item

No editor de item do cardápio (/cardapio), duas novas seções:

- **Canais**: Totem, Site (/pedir), PDV, Garçom, iFood. Marcação múltipla; por padrão todos ligados nos itens existentes.
- **Modalidade**: Entrega e/ou Retirada (padrão: ambos).

Cada tela de venda passa a filtrar o catálogo pelo seu canal, e o site filtra também pela modalidade escolhida pelo cliente (entrega x retirada).

## 2. Categoria Yolo

- A categoria ganha um marcador "Exclusiva Yolo". Enquanto o código não for validado, ela e seus itens não aparecem em lugar nenhum (nem por busca).
- Após validar o código, a categoria aparece com destaque no Totem e no site, durante aquela sessão/carrinho.
- Sem desconto extra: o benefício é o acesso aos itens da categoria.
- O código é consumido na Yolo já na validação inicial (conforme decidido), com registro em `yolo_vouchers_used`.

## 3. Regras de dia e horário (por loja)

Na configuração do cardápio, por categoria Yolo e por loja:

- Dias da semana ativos (dom–sáb).
- Faixa de horário (ex.: 15:00–18:00), com suporte a virada de dia.
- Loja sem regra configurada = categoria indisponível naquela loja.

Fora da janela, mesmo com código válido, a categoria não aparece e a tela informa o próximo horário disponível.

## 4. Fluxo do cliente

```text
Totem/Site -> botão "Tenho código Yolo" -> digita 6 dígitos
   -> valida na Yolo (consulta + consumo)
   -> ok? libera categoria Yolo se a janela da loja estiver aberta
   -> não ok? mensagem de erro, categoria segue oculta
```

## Detalhes técnicos

Banco:
- `menu_items`: colunas `channels text[]` (default todos) e `fulfillment text[]` (default `{delivery,pickup}`).
- `menu_categories`: coluna `is_yolo_exclusive boolean default false`.
- Nova tabela `menu_category_store_windows` (category_id, store_id, weekday 0-6, start_time, end_time) com GRANTs, RLS de leitura pública e escrita para admin/manager; policies com `(SELECT auth.uid())`.

Código:
- `src/lib/menuCatalog.ts`: `loadMenuCatalog(storeId, brandId, { channel, fulfillment, yoloUnlocked })` — remove categorias Yolo quando não desbloqueadas ou fora da janela; filtra itens por canal/modalidade. Fonte única para Totem, /pedir, PDV, Garçom e SmartPOS.
- `MenuItemEditorDialog.tsx`: seleção de canais e modalidades.
- `AddCategoryDialog.tsx` + `Menu.tsx`: flag "Exclusiva Yolo" e editor das janelas por loja.
- Novo componente `YoloCodeDialog` (input de 6 dígitos) usado no Totem e em `/pedir`, chamando `yolo-validate` e `yolo-redeem`; estado `yoloUnlocked` guardado na sessão do carrinho.
- Ao encerrar/limpar o carrinho, o desbloqueio Yolo é descartado.

Segue o design system e o padrão mobile-first já usados no cardápio.
