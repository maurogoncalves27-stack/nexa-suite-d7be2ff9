## Salvar status de produção na memória do projeto

Adicionar uma regra Core em `mem://index.md` para que toda sessão futura respeite o que já está em produção e trate Fichas/Estoque como campo livre para evoluir.

### Nova regra Core (uma linha, sempre em contexto)
> Em produção: RH ponta a ponta + Pagamentos/Financeiro ponta a ponta. Tratar como INTOCÁVEL — não refatorar módulos, tabelas ou fluxos desses domínios sem pedido explícito. Fichas técnicas, Fatores de Conversão, Estoque, Receituário, Cardápio Fábrica e Sugestão de Abastecimento AINDA NÃO estão em produção — livre para migrar schema, dropar colunas e reestruturar sem período de validação.

### Arquivo afetado
- `mem://index.md` (adição na seção Core)

Nada de código é alterado.
