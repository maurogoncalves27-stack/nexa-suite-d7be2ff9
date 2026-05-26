// Biblioteca de roteiros, perguntas e dicas de Recrutamento e Seleção.
// Conteúdo curado a partir de boas práticas de RH (STAR, behavioral interview, fit cultural).

export const STAGES = [
  { value: "novos", label: "Novos", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  { value: "entrevista_agendada", label: "Entrevista agendada", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  { value: "aguardando_inicio", label: "Aprovado - aguardando docs", color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  { value: "documentacao_ok", label: "Documentação OK - aguardando início", color: "bg-teal-500/10 text-teal-700 dark:text-teal-400" },
  { value: "cadastro", label: "Cadastro", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  { value: "teste_pratico", label: "Agendar treinamento", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_1", label: "Dia 1", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_2", label: "Dia 2", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_3", label: "Dia 3", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_4", label: "Dia 4", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_5", label: "Dia 5", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_6", label: "Dia 6", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "treinamento_dia_7", label: "Dia 7", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "contratado", label: "Contratado", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  // Encerrados
  { value: "reprovado", label: "Reprovado", color: "bg-destructive/10 text-destructive" },
  { value: "desistiu", label: "Desistiu", color: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  { value: "talento_futuro", label: "Talento Futuro", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" },
  // Etapas legadas (mantidas só para exibir candidatos antigos sem quebrar)
  { value: "triagem", label: "Triagem (legado)", color: "bg-muted text-muted-foreground" },
  { value: "entrevista_rh", label: "Entrevista RH (legado)", color: "bg-muted text-muted-foreground" },
  { value: "entrevista_gestor", label: "Entrevista Gestor (legado)", color: "bg-muted text-muted-foreground" },
  { value: "proposta", label: "Proposta (legado)", color: "bg-muted text-muted-foreground" },
] as const;

export type StageValue = typeof STAGES[number]["value"];

export const PIPELINE_STAGES: StageValue[] = [
  "novos",
  "entrevista_agendada",
  "aguardando_inicio",
  "documentacao_ok",
  "cadastro",
  "teste_pratico",
  "treinamento_dia_1",
  "treinamento_dia_2",
  "treinamento_dia_3",
  "treinamento_dia_4",
  "treinamento_dia_5",
  "treinamento_dia_6",
  "treinamento_dia_7",
  "contratado",
];

export const TRAINING_DAY_STAGES: StageValue[] = [
  "treinamento_dia_1",
  "treinamento_dia_2",
  "treinamento_dia_3",
  "treinamento_dia_4",
  "treinamento_dia_5",
  "treinamento_dia_6",
  "treinamento_dia_7",
];

/** Retorna o número do dia (1-7) para uma etapa de treinamento, ou null. */
export function trainingDayFromStage(stage: StageValue): number | null {
  const idx = TRAINING_DAY_STAGES.indexOf(stage);
  return idx >= 0 ? idx + 1 : null;
}

// Etapas legadas que ainda podem aparecer em dados antigos — exibidas em "Outros".
export const LEGACY_STAGES: StageValue[] = ["triagem", "entrevista_rh", "entrevista_gestor", "proposta"];

export const SOURCES = [
  "Indicação interna",
  "Instagram / Redes sociais",
  "Site da empresa",
  "Catho / Vagas.com",
  "LinkedIn",
  "Currículo entregue na loja",
  "Banco de talentos",
  "Outro",
];

export const RECOMMENDATIONS = [
  { value: "aprovar", label: "Aprovar", color: "text-emerald-600 dark:text-emerald-400" },
  { value: "reprovar", label: "Reprovar", color: "text-destructive" },
  { value: "talento_futuro", label: "Talento futuro", color: "text-indigo-600 dark:text-indigo-400" },
  { value: "novo_round", label: "Novo round", color: "text-amber-600 dark:text-amber-400" },
];

// ============ PERGUNTAS GERAIS POR ETAPA ============

export interface ScriptQuestion {
  question: string;
  expect: string; // o que esperar de uma boa resposta
  redFlag?: string; // sinal de alerta
}

// ============ DOCUMENTOS SOLICITADOS APÓS ENTREVISTA RH ============
// Checklist enviado ao candidato aprovado na entrevista de RH para avançar
// para o teste prático / contratação. Mantido aqui para ser fácil de editar.
export const REQUESTED_DOCUMENTS_CHECKLIST = [
  "RG (frente e verso)",
  "CPF",
  "Comprovante de residência atualizado (últimos 3 meses)",
  "Carteira de Trabalho (CTPS) — folha de identificação",
  "PIS / NIS / NIT",
  "Título de eleitor",
  "Certificado de reservista (sexo masculino)",
  "Certidão de nascimento ou casamento",
  "Certidão de nascimento dos filhos menores de 14 anos",
  "Carteira de vacinação dos filhos menores de 7 anos",
  "Comprovante de escolaridade",
  "Carteira nacional de habilitação (se exigida pelo cargo)",
  "1 foto 3x4 recente",
  "Conta bancária para depósito de salário",
  "Atestado médico admissional (após agendamento)",
];

export const SCREENING_CHECKLIST = [
  "Currículo legível e atualizado (últimos 12 meses)",
  "Reside em região compatível com a loja (até 1h de deslocamento)",
  "Tem disponibilidade para a escala da vaga (turnos, finais de semana)",
  "Pretensão salarial dentro da faixa",
  "Experiência mínima ou perfil compatível com o cargo",
  "Documentação básica disponível (RG, CPF, comprovante de residência)",
  "Não há vínculo ativo conflitante",
];

export const HR_INTERVIEW_QUESTIONS: ScriptQuestion[] = [
  {
    question: "Conte um pouco sobre você e sua trajetória profissional.",
    expect: "Narrativa coerente, evolução clara entre experiências, motivos plausíveis para mudanças.",
    redFlag: "Históricos contraditórios, gaps longos sem explicação, desabafo negativo sobre todos os ex-empregadores.",
  },
  {
    question: "Por que se interessou por esta vaga e pela nossa empresa?",
    expect: "Demonstra ter pesquisado sobre a empresa, conecta a vaga ao próprio momento de carreira.",
    redFlag: "Resposta genérica ('preciso de qualquer emprego'), não sabe nada sobre o negócio.",
  },
  {
    question: "Qual foi seu maior aprendizado no último emprego?",
    expect: "Reflexão madura, capacidade de extrair lições, autoavaliação honesta.",
    redFlag: "Diz que 'não aprendeu nada', culpa colegas/chefes por tudo.",
  },
  {
    question: "Por que saiu (ou pretende sair) do emprego atual?",
    expect: "Motivos profissionais (crescimento, novo desafio), respeito ao ex-empregador.",
    redFlag: "Críticas pessoais, conflito não resolvido, demissão por justa causa não declarada.",
  },
  {
    question: "Descreva uma situação difícil que enfrentou no trabalho e como resolveu. (Use a técnica STAR: Situação, Tarefa, Ação, Resultado)",
    expect: "Narra com clareza o contexto, sua ação específica e o resultado mensurável. Assume responsabilidade.",
    redFlag: "Foca em culpar outros, descreve a situação mas pula a 'ação' dele, sem resultado claro.",
  },
  {
    question: "Conte uma vez em que recebeu um feedback negativo. O que fez com ele?",
    expect: "Demonstra abertura, exemplifica mudança de comportamento, evolução.",
    redFlag: "Diz que 'nunca recebeu feedback negativo' ou rebate o feedback como injusto.",
  },
  {
    question: "Como você lida com cliente irritado / colega difícil?",
    expect: "Escuta ativa, controle emocional, foco na solução. Dá exemplo concreto.",
    redFlag: "Resposta agressiva, evita o problema, devolve a culpa ao cliente.",
  },
  {
    question: "Como você se organiza quando tem várias tarefas urgentes ao mesmo tempo?",
    expect: "Método claro (priorização, lista, comunicação com o time). Demonstra autonomia.",
    redFlag: "Diz que 'faz o que vier primeiro' ou 'pede para o chefe decidir tudo'.",
  },
  {
    question: "O que você faria nos primeiros 30 dias se fosse contratado?",
    expect: "Plano realista: aprender o processo, observar, perguntar, começar a entregar aos poucos.",
    redFlag: "Promete revoluções imediatas ou diz 'farei o que mandarem'.",
  },
  {
    question: "Quais seus pontos fortes e pontos a desenvolver?",
    expect: "Autoconhecimento + plano de ação para evoluir. Coerente com exemplos dados.",
    redFlag: "'Sou perfeccionista demais' ou negar qualquer ponto fraco.",
  },
  {
    question: "Qual sua pretensão salarial e quais seus planos profissionais para os próximos 2 anos?",
    expect: "Valor coerente com o mercado, objetivos claros e alinhados ao que a vaga oferece.",
    redFlag: "Fora da faixa sem flexibilidade, ou planos completamente desalinhados (quer mudar de área no curto prazo).",
  },
  {
    question: "Tem disponibilidade para escala 6x1, finais de semana e feriados?",
    expect: "Resposta direta, ciência das implicações, organização pessoal compatível.",
    redFlag: "Hesitação, condições não declaradas no início, restrições amplas.",
  },
];

// Mantido por compatibilidade com avaliações antigas que referenciam este array.
// O fluxo atual concentra tudo na entrevista de RH (que já inclui perguntas comportamentais STAR).
export const MANAGER_INTERVIEW_QUESTIONS: ScriptQuestion[] = [
  {
    question: "Descreva uma situação difícil que enfrentou no trabalho e como resolveu. (Use a técnica STAR: Situação, Tarefa, Ação, Resultado)",
    expect: "Narra com clareza o contexto, sua ação específica e o resultado mensurável. Assume responsabilidade.",
    redFlag: "Foca em culpar outros, descreve a situação mas pula a 'ação' dele, sem resultado claro.",
  },
  {
    question: "Conte uma vez em que recebeu um feedback negativo. O que fez com ele?",
    expect: "Demonstra abertura, exemplifica mudança de comportamento, evolução.",
    redFlag: "Diz que 'nunca recebeu feedback negativo' ou rebate o feedback como injusto.",
  },
  {
    question: "Como você lida com cliente irritado / colega difícil?",
    expect: "Escuta ativa, controle emocional, foco na solução. Dá exemplo concreto.",
    redFlag: "Resposta agressiva, evita o problema, devolve a culpa ao cliente.",
  },
  {
    question: "Qual foi a maior conquista profissional que se orgulha?",
    expect: "Conquista real e específica, com impacto mensurável (vendas, redução de retrabalho, etc.).",
    redFlag: "Resposta vaga ou conquistas pessoais não relacionadas ao trabalho.",
  },
  {
    question: "Como você se organiza quando tem várias tarefas urgentes ao mesmo tempo?",
    expect: "Método claro (priorização, lista, comunicação com o time). Demonstra autonomia.",
    redFlag: "Diz que 'faz o que vier primeiro' ou 'pede para o chefe decidir tudo'.",
  },
  {
    question: "O que você faria nos primeiros 30 dias se fosse contratado?",
    expect: "Plano realista: aprender o processo, observar, perguntar, começar a entregar aos poucos.",
    redFlag: "Promete revoluções imediatas ou diz 'farei o que mandarem'.",
  },
  {
    question: "Quais seus pontos a desenvolver?",
    expect: "Honestidade + plano de ação para evoluir.",
    redFlag: "'Sou perfeccionista demais' ou negar qualquer ponto fraco.",
  },
];

export const CULTURE_FIT_QUESTIONS: ScriptQuestion[] = [
  {
    question: "Em uma escala de 1 a 10, quão importante é trabalho em equipe para você? Por quê?",
    expect: "Valoriza o time, dá exemplo concreto de colaboração.",
    redFlag: "Diz que prefere trabalhar sozinho, evita compartilhar conhecimento.",
  },
  {
    question: "Como você reage quando precisa fazer algo fora do seu escopo de função?",
    expect: "Disposição, vê como oportunidade de aprender, comunica se sobrecarregar.",
    redFlag: "'Não é minha função', recusa-se a ajudar, culpa a empresa por desorganização.",
  },
  {
    question: "Conte uma situação em que precisou seguir uma regra com a qual não concordava.",
    expect: "Respeitou o processo, levou a divergência pelos canais corretos.",
    redFlag: "Burlou a regra ou criou conflito aberto.",
  },
];

// ============ PERGUNTAS POR CARGO (técnicas/práticas) ============

export const POSITION_SPECIFIC: Record<string, ScriptQuestion[]> = {
  "Atendente": [
    {
      question: "Como você apresentaria nosso cardápio para um cliente indeciso?",
      expect: "Faz perguntas para entender o gosto, sugere combos, demonstra conhecimento de produto.",
      redFlag: "Apenas lê o cardápio sem personalizar.",
    },
    {
      question: "Um cliente reclama que o pedido demorou. O que você faz?",
      expect: "Escuta sem interromper, pede desculpas, busca solução real (verificar pedido, oferecer cortesia se aplicável).",
      redFlag: "Justifica com o pessoal da cozinha, devolve a queixa.",
    },
    {
      question: "Você está em horário de pico, fila grande e sistema lento. Como age?",
      expect: "Mantém calma, comunica os clientes, prioriza fluxo, pede ajuda ao supervisor se necessário.",
      redFlag: "Demonstra estresse, atende com má vontade.",
    },
    {
      question: "Conhece técnicas de venda sugestiva (upsell)? Dê um exemplo.",
      expect: "Sabe oferecer adicional, sobremesa, bebida, sem pressionar.",
    },
  ],
  "Auxiliar de cozinha": [
    {
      question: "Conhece e segue boas práticas de manipulação de alimentos? Cite 3.",
      expect: "Higiene das mãos, separação de alimentos crus/cozidos, controle de temperatura, cabelos presos, EPI.",
      redFlag: "Não cita nenhuma prática básica de segurança alimentar.",
    },
    {
      question: "Como você organiza seu posto de trabalho durante o turno?",
      expect: "Mise en place (preparo prévio), limpeza contínua, reposição de insumos.",
    },
    {
      question: "Recebeu uma mercadoria com prazo de validade curto. O que faz?",
      expect: "Comunica o supervisor, prioriza no PEPS (primeiro que entra, primeiro que sai), separa para uso imediato.",
      redFlag: "Aceita sem questionar ou descarta sem avisar.",
    },
    {
      question: "Tem CBO de manipulador? Curso de boas práticas?",
      expect: "Possui ou está disposto a fazer treinamento.",
    },
  ],
  "Estoquista": [
    {
      question: "Como você organiza um estoque para evitar perdas e facilitar a contagem?",
      expect: "PEPS, etiquetas visíveis, agrupamento por categoria, separação por validade.",
    },
    {
      question: "Identificou divergência entre estoque físico e sistema. O que faz?",
      expect: "Recontagem, registro da divergência, comunicação ao supervisor, investigação da causa.",
      redFlag: "Ajusta sistema sem comunicar.",
    },
    {
      question: "Tem familiaridade com sistemas de controle de estoque (ex.: WMS, ERP)?",
      expect: "Cita sistemas que usou, demonstra raciocínio lógico para aprender outros.",
    },
  ],
  "Supervisor de Loja": [
    {
      question: "Como você lida com um colaborador que está performando abaixo do esperado?",
      expect: "Conversa em particular, identifica causa, define plano de ação com prazo e acompanha. Documenta.",
      redFlag: "Demite na primeira oportunidade ou ignora o problema.",
    },
    {
      question: "Descreva como você abre e fecha uma loja: o que prioriza?",
      expect: "Checklist de abertura/fechamento, conferência de caixa, equipe alinhada, segurança.",
    },
    {
      question: "Como você equilibra cobrança de metas e clima da equipe?",
      expect: "Comunica metas com clareza, reconhece esforço, dá feedback contínuo, celebra resultados.",
      redFlag: "Apenas cobra ou apenas evita conflito.",
    },
    {
      question: "Quais indicadores você acompanha diariamente?",
      expect: "Vendas, ticket médio, conversão, turnover, NPS, perdas, presença/atrasos.",
    },
    {
      question: "Já demitiu alguém? Como conduziu?",
      expect: "Processo formal, justa causa documentada, conversa respeitosa, comunicação ao time.",
    },
  ],
  "Gerente Geral": [
    {
      question: "Como você estrutura o planejamento mensal da loja (vendas, escala, custos, equipe)?",
      expect: "Visão sistêmica: orçamento, metas por canal, dimensionamento da equipe, plano de ação.",
    },
    {
      question: "Sua loja teve queda de 15% no faturamento por 2 meses seguidos. Plano de ação?",
      expect: "Diagnóstico (mercado, equipe, mix, marketing), plano com responsáveis e prazo, acompanhamento semanal.",
      redFlag: "Culpa apenas fatores externos sem ação.",
    },
    {
      question: "Como você desenvolve novos líderes na operação?",
      expect: "Identifica potencial, dá responsabilidades graduais, mentora, planeja sucessão.",
    },
    {
      question: "Já gerenciou conflito entre dois encarregados? Como resolveu?",
      expect: "Mediação, escuta separada, plano conjunto, acompanhamento.",
    },
    {
      question: "Como você acompanha indicadores e reporta resultados à diretoria?",
      expect: "Rotina definida, dashboards, narrativa clara, propostas de ação.",
    },
  ],
  "Encarregado de produção": [
    {
      question: "Como você dimensiona a produção do dia para evitar sobra e falta?",
      expect: "Histórico de venda, previsão de demanda, comunicação com salão, ajuste em tempo real.",
    },
    {
      question: "Detectou falha de qualidade num lote. O que faz?",
      expect: "Retira o lote, identifica causa raiz, retreina equipe, registra ocorrência.",
    },
  ],
  "Encarregado de escritório": [
    {
      question: "Como você organiza a rotina de fechamento do mês (financeiro, fiscal, RH)?",
      expect: "Calendário, checklist, integração com áreas, conferências antes do envio.",
    },
    {
      question: "Quais sistemas e ferramentas administrativas você domina?",
      expect: "Excel intermediário/avançado, ERP, sistema fiscal, DP.",
    },
  ],
  "Auxiliar administrativo": [
    {
      question: "Conte uma vez que precisou organizar muitos documentos com prazo apertado.",
      expect: "Método de priorização, foco, comunicação de prazo realista.",
    },
    {
      question: "Qual seu nível de Excel? Cite fórmulas que usa.",
      expect: "PROCV, SOMASE, tabelas dinâmicas, formatação condicional.",
    },
  ],
  "Estagiário": [
    {
      question: "O que você espera aprender no estágio?",
      expect: "Objetivos de aprendizado claros, conexão com o curso.",
    },
    {
      question: "Como você equilibra estudos e estágio?",
      expect: "Organização de tempo, comunicação com a faculdade.",
    },
  ],
  "Trainee": [
    {
      question: "Qual área de negócio mais te interessa e por quê?",
      expect: "Pesquisou sobre a empresa, conecta interesse pessoal.",
    },
    {
      question: "Conte um projeto em que liderou ou se destacou na faculdade.",
      expect: "Iniciativa, resultado tangível, aprendizado.",
    },
  ],
};

export function questionsForPosition(position: string): ScriptQuestion[] {
  return POSITION_SPECIFIC[position] ?? [];
}

// ============ DICAS GERAIS DE BOA SELEÇÃO ============

export const SELECTION_TIPS = [
  {
    title: "Use a técnica STAR",
    text: "Peça ao candidato para descrever Situação, Tarefa, Ação e Resultado. Respostas vagas viram um sinal de alerta.",
  },
  {
    title: "Faça perguntas comportamentais",
    text: "'Conte uma vez em que...' revela mais do que 'Você é proativo?'. Comportamento passado é o melhor preditor.",
  },
  {
    title: "Padronize as perguntas",
    text: "Pergunte o mesmo para todos os candidatos da mesma vaga. Facilita comparar com justiça.",
  },
  {
    title: "Avalie fit cultural",
    text: "Habilidade técnica se ensina; valores e atitude, não. Verifique respeito, colaboração e ética.",
  },
  {
    title: "Peça referência profissional",
    text: "Ligue para o último gestor. Pergunte: 'Você o contrataria de novo?'. Silêncio é resposta.",
  },
  {
    title: "Faça teste prático",
    text: "Para operação: experiência simulada (atendimento, organização de estoque). Para liderança: cases reais da loja.",
  },
  {
    title: "Não decida sozinho",
    text: "Pelo menos 2 entrevistadores na fase final. Reduz vieses pessoais e melhora a decisão.",
  },
  {
    title: "Documente tudo",
    text: "Anote pontos fortes, alertas e a recomendação. Isso protege a empresa e gera histórico para o banco de talentos.",
  },
];

export const RED_FLAGS = [
  "Atrasou para a entrevista sem avisar",
  "Critica todos os ex-empregadores",
  "Respostas inconsistentes sobre datas e cargos",
  "Não fez nenhuma pergunta sobre a empresa ou a vaga",
  "Pretensão salarial fora da faixa sem flexibilidade",
  "Linguagem desrespeitosa ou preconceituosa",
  "Currículo com diversas passagens curtas (< 6 meses) sem justificativa",
  "Demonstrou pressa em sair só pelo dinheiro",
];

export const GREEN_FLAGS = [
  "Chegou no horário e bem apresentado",
  "Pesquisou sobre a empresa antes da entrevista",
  "Respondeu com exemplos concretos (STAR)",
  "Demonstrou autoconhecimento (forças e pontos a desenvolver)",
  "Fez perguntas relevantes sobre a vaga e a equipe",
  "Falou bem dos ex-empregadores, mesmo dos difíceis",
  "Pretensão salarial coerente e justificada",
  "Demonstrou energia e interesse genuíno",
];
