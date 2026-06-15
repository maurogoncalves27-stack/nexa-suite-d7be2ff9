## Card "Roteiro de Testes"

Novo card visual em `src/components/tef-paygo/TefRoteiroTestesCard.tsx`, inserido em `src/pages/TefPaygoSetup.tsx` logo abaixo de `<TefTestSaleCard />`.

### Conteúdo (passo a passo, baseado nos cenários PayGo sandbox)

Lista numerada com checkboxes (estado apenas local — marca/desmarca para acompanhar progresso, sem persistência):

1. **Pinpad conectado** — confirmar no card "Pinpad" status "OK na porta X" antes de iniciar.
2. **Venda Débito aprovada** — clicar "Débito" no card Venda de Teste, valor R$ 1,00, senha sandbox `1234`. Esperado: comprovante impresso na impressora simulada.
3. **Venda Crédito à vista aprovada** — botão "Crédito", à vista, senha `1234`.
4. **Venda Crédito parcelado (2x sem juros)** — botão "Crédito", escolher parcelado loja no menu DEMO.
5. **Venda negada** — repetir débito digitando senha errada (`0000`). Esperado: retorno negado, sem cupom.
6. **Cancelamento de venda** — usar card "Extrator de RECNUM" para pegar NSU da última venda aprovada e cancelar via botão "Cancelar".
7. **PIX QR Code C6 BANK** — botão "PIX" no card Venda de Teste, valor R$ 1,00. Esperado: QR exibido no pinpad, simular pagamento.
8. **Reimpressão (opcional)** — verificar histórico no card da impressora simulada (rolar lista).
9. **Checklist de homologação** — marcar cenários concluídos no card "Checklist" para registrar evidências.

### Layout do card

- Header: ícone `ListChecks` + título "Roteiro de testes" + subtítulo "Siga na ordem para validar a integração".
- Cada passo: linha com `Checkbox` + número em badge + título em negrito + descrição curta em `text-muted-foreground text-sm`.
- Passo marcado fica com `line-through` e opacidade reduzida.
- Botão "Resetar" no canto superior direito para limpar marcações.

### Arquivos

- **novo**: `src/components/tef-paygo/TefRoteiroTestesCard.tsx`
- **editado**: `src/pages/TefPaygoSetup.tsx` (1 linha — import + render abaixo de `TefTestSaleCard`)
