Alterar o `DialogContent` em `src/pages/StoreHome.tsx` para exibir como modal (não full-screen):

- Substituir a classe full-screen (`max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 sm:rounded-none flex flex-col`) por dimensões de modal: `max-w-[70vw] w-[70vw] h-[85vh] p-0 gap-0 rounded-lg border shadow-2xl flex flex-col`.
- Manter o `onInteractOutside` para evitar fechamento acidental.
- O botão "Voltar ao PDV" continua funcionando igual, pois ele apenas chama `setActive(null)`.

Isso transforma as páginas de atalho (NutriControle, Contagem, Ocorrências, etc.) em modais sobrepostos ao PDV, em vez de janelas em tela cheia. Só publicar basta — não precisa rebuild.