## Por que precisa

O roteiro oficial PayGo C6 (`Roteiro_de_testes_v20241216`) pede em quase todos os passos: **"Recibo impresso corretamente"**. Como a integração é via **Biblioteca Windows (PGWebLib)**, é a automação que imprime — a DLL apenas devolve o texto do cupom em campos como `PWINFO_CUPOMx` / via estabelecimento / via portador / cupom reduzido. Sem capturar e exibir esse texto, não há como evidenciar nenhum passo do roteiro.

A solução aceita pela Setis é uma **impressora simulada**: renderizar em tela o cupom exatamente como veio do PdC, com export TXT/PDF para anexar como evidência.

## Escopo (somente cosmético + captura do texto que já é retornado)

Não altera regra de negócio, fluxo de venda, parâmetros, nem a comunicação com PGWebLib. Só:

1. Passa adiante o texto do cupom que o PGWebLib já retorna.
2. Mostra esse texto em um "rolo de impressora" na UI.

## Mudanças

### 1. Agente Electron (`electron-acbr/acbr-tefd.cjs`)
Pequeno acréscimo no handler de resposta de transação para coletar, se presentes, os campos da PGWebLib relacionados a cupom e devolvê-los junto do payload já existente — sem mudar nada do fluxo:

- `PWINFO_CUPOMx` (texto completo)
- `PWINFO_VIACLIENTE` / `PWINFO_VIAESTABELEC`
- `PWINFO_CUPOMREDUZIDO`
- `PWINFO_CUPOMDIF1` / `CUPOMDIF2` (recibos diferenciados — passos 9 e 10)

Saída fica: `{ ...payloadExistente, receipt: { merchant, customer, reduced, diff1, diff2 } }`.

Nenhum comportamento atual muda; só agrega campos opcionais.

### 2. UI — novo componente `src/components/tef-paygo/SimulatedPrinter.tsx`
- Card "Impressora Simulada" no topo da página, ao lado do card de teste de venda.
- Mostra o último cupom recebido em fonte monoespaçada, 40 colunas, fundo "papel" claro, com botões:
  - **Imprimir via** (alterna entre Estabelecimento / Cliente / Reduzido / Diferenciado 1 / 2)
  - **Baixar .TXT** e **Baixar .PDF** (jsPDF) — nome do arquivo inclui passo + data/hora para anexar como evidência.
  - **Limpar**.
- Histórico curto (últimos 10 cupons em uma lista lateral colapsável).

### 3. UI — `src/pages/TefPaygoSetup.tsx`
- Adicionar o `<SimulatedPrinter />` logo abaixo do card de Teste de Venda (já existente).
- Quando o teste de venda retornar `receipt`, alimentar o componente via estado local/contexto leve já presente na página.
- Sem outras mudanças visuais.

### 4. Hook compartilhado `src/hooks/useTefReceipts.ts` (novo, pequeno)
Pequeno store em memória (Zustand já usado no projeto ou `useState` no topo da página) para empurrar cada cupom recebido no histórico da impressora.

## Fora de escopo

- Não toca em PGWebLib, agente de TEF (motor), parâmetros de instalação, fluxo de venda, cancelamento, pinpad.
- Não cria endpoint novo nem migration.
- Não imprime de verdade em impressora física.

## Resultado

Cada passo do roteiro (Instalação, Venda à vista, Crédito, Débito, Parcelado, PIX, Recibos diferenciados, Contactless, Cancelamentos) gera um cupom visível e exportável em PDF/TXT — evidência suficiente para a Setis encerrar a homologação.

```text
+------------------------------------------------+
|  TESTE DE VENDA  |  IMPRESSORA SIMULADA       |
|  [valor] [tipo]  |  --- PAYGO PdC 111476 ---  |
|  [Vender]        |  CREDITO A VISTA           |
|                  |  R$ 10,00  AUT 123456      |
|                  |  ...                       |
|                  |  [via estab][cliente][...] |
|                  |  [TXT] [PDF] [limpar]      |
+------------------------------------------------+
```
