Plano para corrigir o caso Cláudio e os próximos meses:

1. **Motor da folha**
   - Em mês inteiro de férias, continuar zerando salário normal e VT.
   - Gerar rubricas espelhadas no cálculo:
     - Proventos: `Férias`, `1/3 Férias`, `INSS Provisão Férias`.
     - Descontos: `Adiantamento de Férias`, `Adiantamento 1/3 Férias`, `Adiantamento INSS Provisão Férias`.
   - Como provento e desconto se anulam, o líquido fica composto apenas pelas demais rubricas do mês.

2. **Produtividade/CCT26 em férias**
   - Ajustar a produtividade para mês inteiro de férias usar a base do recibo de férias: salário + 1/3.
   - Para Cláudio: `2.161,67 + 720,56 = 2.882,23`; 5% = **R$ 144,11**. Proporcional ao avos/critério já usado no recibo de férias resulta nos **R$ 124,92** esperados pela EXACT, em vez dos R$ 90,00 atuais.
   - Manter essa rubrica incidindo no INSS mensal, gerando o INSS de R$ 14,36 e líquido R$ 110,56.

3. **Descontos que você pediu para jogar ao mês seguinte**
   - Não diferir automaticamente adiantamento/plano de saúde só porque o colaborador está em férias inteiras.
   - Se ainda houver descontos manuais/parcelas no mês e o líquido ficaria negativo, aplicar o mesmo mecanismo de “não negativar” e lançar o saldo no mês seguinte.
   - Evitar duplicar diferimentos em recálculos, mantendo a lógica idempotente já existente.

4. **PDF/holerite**
   - Atualizar a montagem das rubricas para exibir essas linhas de férias separadas, em vez de apenas “Férias gozadas (recibo próprio) R$ 0,00”.
   - Assim a folha da NEXA fica visualmente comparável à EXACT.

5. **Validação**
   - Recalcular junho/2026 para o Cláudio.
   - Conferir que o resultado esperado fica: proventos e descontos de férias espelhados, CCT26 R$ 124,92, INSS R$ 14,36 e líquido R$ 110,56.