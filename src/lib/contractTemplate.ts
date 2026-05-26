/**
 * Modelo padrão de contrato CLT por prazo indeterminado.
 * Usado como ponto de partida quando ainda não existe template salvo no banco.
 * Os placeholders {{...}} são substituídos por dados reais do colaborador/empresa
 * em src/lib/contractPdf.ts (função buildContract).
 */
export const DEFAULT_CONTRACT_TEMPLATE = `CLÁUSULA 1ª — DO OBJETO E DO CARGO
O(A) EMPREGADO(A) é admitido(a) para exercer a função de {{cargo}}, no departamento de {{departamento}}, com prestação de serviços na unidade {{loja_alocacao}}, comprometendo-se a desempenhar com zelo, diligência e lealdade todas as atividades inerentes ao cargo.

CLÁUSULA 2ª — DAS RESPONSABILIDADES E ATRIBUIÇÕES
Constituem responsabilidades e atribuições do(a) EMPREGADO(A), sem prejuízo de outras tarefas correlatas determinadas pela EMPREGADORA:
{{responsabilidades}}

CLÁUSULA 3ª — DA JORNADA DE TRABALHO
A jornada de trabalho será de {{jornada}}, observados os intervalos legais para repouso e alimentação, podendo ser prorrogada nos termos do art. 59 da CLT, mediante compensação ou pagamento das horas extras conforme legislação vigente.

CLÁUSULA 4ª — DA REMUNERAÇÃO
Pelo exercício de suas funções, o(a) EMPREGADO(A) receberá o salário mensal de R$ {{salario}} ({{salario_extenso}}), pago até o 5º (quinto) dia útil do mês subsequente ao vencido, mediante crédito em conta bancária ou outra forma legalmente admitida.

CLÁUSULA 5ª — DO LOCAL DE TRABALHO
A prestação dos serviços ocorrerá em {{loja_alocacao}}, podendo a EMPREGADORA, dentro do seu poder diretivo e por necessidade do serviço, transferir o(a) EMPREGADO(A) para outra unidade, observado o disposto no art. 469 da CLT.

CLÁUSULA 6ª — DO PERÍODO DE EXPERIÊNCIA
O presente contrato terá período inicial de experiência de {{periodo_experiencia}} dias, contados a partir de {{data_admissao}}, durante o qual qualquer das partes poderá rescindi-lo nos termos da legislação trabalhista. Findo esse prazo sem manifestação em contrário, o contrato passará automaticamente a vigorar por prazo indeterminado.

CLÁUSULA 7ª — DOS BENEFÍCIOS
O(A) EMPREGADO(A) fará jus aos benefícios legais e àqueles eventualmente concedidos pela EMPREGADORA, incluindo, quando aplicável, vale-transporte (com desconto legal de até 6% do salário-base), conforme políticas internas vigentes, as quais poderão ser alteradas a qualquer tempo no exercício do poder diretivo do empregador.

CLÁUSULA 8ª — DAS OBRIGAÇÕES DO EMPREGADO
São obrigações do(a) EMPREGADO(A): (i) cumprir fielmente as ordens e instruções da EMPREGADORA; (ii) zelar pelos bens e equipamentos colocados sob sua guarda; (iii) observar as normas internas, regulamentos, manuais e código de conduta; (iv) manter sigilo sobre informações confidenciais a que tenha acesso em razão do trabalho; (v) comunicar imediatamente à EMPREGADORA qualquer fato que possa prejudicar o serviço.

CLÁUSULA 9ª — DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS
O(A) EMPREGADO(A) compromete-se a manter absoluto sigilo sobre todas as informações, dados pessoais, segredos comerciais, estratégias e procedimentos da EMPREGADORA, mesmo após o término do contrato, sob pena de responder civil e criminalmente pelos danos causados, observados ainda os deveres impostos pela Lei nº 13.709/2018 (LGPD).

CLÁUSULA 10ª — DA RESCISÃO
O contrato poderá ser rescindido por qualquer das partes, com ou sem justa causa, observadas as hipóteses, prazos e verbas previstos na CLT. Em caso de pedido de demissão ou dispensa sem justa causa, deverão ser respeitados os prazos de aviso prévio legais.

CLÁUSULA 11ª — DAS DISPOSIÇÕES GERAIS
Aplicam-se ao presente contrato, no que couber, as normas da Consolidação das Leis do Trabalho (CLT), das convenções e acordos coletivos da categoria e demais legislações pertinentes. Eventuais omissões serão resolvidas em conformidade com a legislação trabalhista brasileira.

CLÁUSULA 12ª — DO FORO
Fica eleito o foro da comarca da sede da EMPREGADORA para dirimir quaisquer questões oriundas do presente contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.

E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença das testemunhas abaixo.`;
