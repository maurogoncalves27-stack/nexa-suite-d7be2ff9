# Mini-player flutuante CazéTV na tela da loja

Adicionar um botão flutuante de TV apenas na rota `/loja` (`StoreHome.tsx`). Ao clicar, abre um mini-player do YouTube (CazéTV por padrão), arrastável e com liga/desliga. PDVs e outras rotas ficam intocados.

## Arquivos

**Novo:** `src/components/store/FloatingTvPlayer.tsx`
- Estado fechado: botão redondo fixo no canto inferior direito com ícone `Tv` (lucide) + tooltip "TV ao vivo".
- Estado aberto: card 320×180 (16:9) com header arrastável mostrando "CazéTV • ao vivo" e botões: mudo/som (`Volume2`/`VolumeX`), minimizar, fechar (`X`).
- Iframe: `https://www.youtube.com/embed/live_stream?channel=UCd0Ya-h5tXvvwK1_Q_urMkw&autoplay=1&mute={0|1}&playsinline=1`, com `allow="autoplay; encrypted-media; picture-in-picture"` e `allowFullScreen`.
- Drag via `pointerdown`/`pointermove` no header, clamp dentro da viewport.
- Persistência em `localStorage` (`store.tv.state`): `{ open, x, y, muted }`.
- z-index alto (ex.: `z-[60]`) para ficar acima do PDV e do Dialog dos atalhos.
- Fallback: se o iframe falhar (evento `onError` ou timeout de 4s sem load), mostrar link "Abrir no YouTube" apontando para `https://www.youtube.com/@CazeTV/live`.
- Usa tokens do design system (`bg-card`, `border`, `text-foreground`, `text-primary`), sem cores hardcoded.

**Editar:** `src/pages/StoreHome.tsx`
- Importar `FloatingTvPlayer` e renderizar `<FloatingTvPlayer />` como último filho do container raiz. Nenhuma outra alteração.

## Comportamento

- Autoplay inicial mudo (política do Chromium); som com 1 clique.
- Fechar esconde o player e volta ao botão redondo; estado persiste entre sessões.
- Mobile (viewport < 640px): player ocupa 90vw mantendo 16:9, ancorado no canto inferior, drag desabilitado.
- Nenhuma migração de banco, nenhuma mudança em PDV/roteamento.

## Fora do escopo

- Configuração admin por loja (canal customizado, agendamento) — pode entrar depois se necessário.
- Log de tempo assistido.
