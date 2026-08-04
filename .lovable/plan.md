# Pré-visualização em tempo real do totem

Adicionar, nas abas **Visual** e **Vídeo** de `/configuracoes/totem`, um painel que mostra como o totem vai aparecer com as configurações atuais — atualizando na hora a cada upload, ativação/desativação ou exclusão de imagem, vídeo ou logo, sem precisar abrir o totem.

## O que o usuário vai ver

Um "monitor" em pé (proporção de tela de totem, 9:16) ao lado/abaixo dos cards de configuração, com dois modos selecionáveis:

1. **Tela de atrair** — reproduz exatamente a lógica real do totem:
   - se houver vídeo ativo, ele toca em loop (mudo, sem controles);
   - se não houver, entra o slideshow das imagens de fundo ativas, com a mesma transição suave;
   - se não houver nem vídeo nem imagem ativa, mostra o fundo padrão de fábrica;
   - por cima, a mesma arte: "PEÇA AQUI", selo "Seu pedido em 15 min" e "Toque na tela para começar".
2. **Escolha de marca** — mostra os cartões das marcas com as logos cadastradas, para conferir se as logos ficaram legíveis; marca sem logo aparece com o nome, igual ao totem.

Avisos contextuais dentro do preview:
- quando existe vídeo ativo, uma faixa informa que o slideshow de imagens está sendo ignorado;
- quando não há nenhum fundo ativo, informa que o totem usará as imagens padrão.

O preview aparece nas duas abas (Visual e Vídeo), sempre lendo o mesmo estado já carregado na página, então qualquer alteração reflete imediatamente.

## Detalhes técnicos

- Novo componente `src/components/totem/TotemLivePreview.tsx`, puramente de apresentação: recebe por props `assets` (lista de `totem_assets` já em memória em `TotemConfig`) e `brands`.
- Deriva internamente: `video` = primeiro asset `kind="video"` com `is_active`; `backgrounds` = assets `kind="background"` ativos ordenados por `sort_order`; `logos` mapeados por `brand_slug`.
- Slideshow com `useEffect` + intervalo de 5s e crossfade por opacidade — mesma regra visual de `src/pages/Totem.tsx` (step `idle`).
- Renderizado dentro de um contêiner com proporção fixa e `transform: scale()` (via wrapper com `overflow-hidden`), de forma que as tipografias gigantes do totem caibam proporcionalmente no card.
- `src/pages/TotemConfig.tsx`: importa o componente e o insere no fim das `TabsContent` "visual" e "video", com um seletor de modo (Atrair / Marcas) em estado local.
- Somente tokens do design system; nenhuma cor hardcoded. Layout mobile-first: em telas estreitas o preview ocupa a largura total acima/abaixo dos cards; em telas largas fica em coluna lateral.
- Sem mudanças de schema, de backend ou em `src/pages/Totem.tsx`.
