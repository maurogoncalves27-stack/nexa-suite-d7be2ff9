# Remover botão "Abrir no YouTube" do mini-player

Ajuste pontual em `src/components/store/FloatingTvPlayer.tsx`: no estado de fallback (quando o iframe falha ao carregar), remover o botão/link `Abrir no YouTube` e o import não usado de `ExternalLink` e `Button`.

## Nova UI do fallback
Apenas uma mensagem simples centralizada:
> "Não foi possível carregar o player. Tente novamente mais tarde."

Sem link externo, sem CTA. O colaborador pode fechar/minimizar pelos botões do header como antes.

## Arquivos
- `src/components/store/FloatingTvPlayer.tsx` — remover bloco do `<Button asChild>...YouTube...</Button>`, remover imports órfãos (`ExternalLink`, `Button`) e a constante `YT_LIVE_URL`.
