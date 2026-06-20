# Avaliação em duas etapas: Marca → Loja

Substituir os 4 botões atuais por um fluxo de duas etapas, mantendo tudo dentro da página `/surpresa` (sem rota nova, sem reload) e no mesmo padrão visual sóbrio do site.

## Etapa 1 — Escolha da marca
Seção "Me avalia, please!" passa a mostrar **3 cards grandes**, um por marca:

- Aquela Parmê
- Estrogonofe (Estrogonofe de Carne)
- Box Caipira

Cada card tem: nome da marca, uma frase curta ("4 unidades" / "3 unidades" etc.) e um ícone discreto. Ao clicar, a etapa 2 aparece logo abaixo com transição suave (fade/slide via `Reveal` ou framer-motion já usado).

## Etapa 2 — Escolha da loja
Aparece abaixo dos cards de marca, mostrando apenas as lojas onde aquela marca opera, como pills (mesmo estilo dos botões atuais):

- Aquela Parmê: Águas Claras, Asa Sul, Asa Norte, Lago Sul
- Estrogonofe: (definir lojas — provavelmente as mesmas 4)
- Box Caipira: (definir lojas)

Cada pill abre o link de busca no Google Maps em nova aba (`reviewUrl(marca, loja)` ajustado para incluir o nome da marca na query, ex.: `Aquela Parmê Asa Norte`).

Botão discreto "← trocar marca" volta para a etapa 1 sem perder contexto.

## Visual
- Mesmos tokens já em uso (`bg-card`, `shadow-card`, `rounded-2xl`, `ring-border`, `text-store-*`).
- Cards de marca podem usar a cor fixa da marca (vermelho/marrom/laranja) apenas como acento sutil (borda ou ícone), nunca fundo chapado, para manter sobriedade.
- Mantém ícone ⭐ e subtítulo atuais.

## Estrutura técnica
- Arquivo único editado: `src/pages/parme/Surpresa.tsx`.
- Estado local `selectedBrand` (`useState<Brand | null>`).
- Constante `BRANDS` com `{ id, name, stores: string[] }`.
- Função `reviewUrl(brandName, storeName)` monta a URL do Google Maps.
- Sem mudanças em rotas, hostname guard, ou backend.

## Pergunta aberta
Confirme as lojas de **Estrogonofe** e **Box Caipira** (assumo as 4 mesmas de Aquela Parmê se não disser nada — totalizando 12 links).
