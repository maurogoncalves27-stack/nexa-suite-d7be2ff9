-- Tabela de modelos de contrato
CREATE TABLE public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view contract templates"
ON public.contract_templates
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin and manager manage contract templates"
ON public.contract_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_contract_templates_updated_at
BEFORE UPDATE ON public.contract_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Template padrão inicial
INSERT INTO public.contract_templates (name, content, is_active) VALUES (
  'Contrato CLT Padrão',
'CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO

EMPREGADOR: {{empresa_razao_social}}, inscrita no CNPJ sob nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, doravante denominada EMPREGADORA.

EMPREGADO(A): {{nome}}, {{nacionalidade}}, {{estado_civil}}, portador(a) do RG nº {{rg}} e CPF nº {{cpf}}, residente e domiciliado(a) em {{endereco}}, {{cidade}}/{{estado}}, CEP {{cep}}, doravante denominado(a) EMPREGADO(A).

As partes acima identificadas têm entre si justo e contratado o presente Contrato Individual de Trabalho, mediante as cláusulas e condições a seguir:

CLÁUSULA 1ª - DO OBJETO
O(a) EMPREGADO(A) fica admitido(a) para exercer a função de {{cargo}}, no departamento de {{departamento}}, na unidade {{loja_alocacao}}, comprometendo-se a desempenhar todas as atribuições inerentes ao cargo conforme descrito na CLÁUSULA 4ª.

CLÁUSULA 2ª - DA REMUNERAÇÃO
A remuneração mensal do(a) EMPREGADO(A) será de R$ {{salario}} ({{salario_extenso}}), a ser paga até o 5º (quinto) dia útil do mês subsequente ao vencido.

CLÁUSULA 3ª - DA JORNADA DE TRABALHO
A jornada de trabalho será de {{jornada}}, respeitando-se os intervalos legais para descanso e refeição, conforme legislação vigente.

CLÁUSULA 4ª - DAS ATRIBUIÇÕES E RESPONSABILIDADES
São responsabilidades do(a) EMPREGADO(A) no cargo de {{cargo}}:
{{responsabilidades}}

CLÁUSULA 5ª - DA VIGÊNCIA
O presente contrato vigorará por prazo indeterminado, iniciando-se em {{data_admissao}}, com período de experiência de {{periodo_experiencia}} dias, conforme art. 445, parágrafo único, da CLT.

CLÁUSULA 6ª - DAS DEMAIS CONDIÇÕES
Aplicam-se ao presente contrato todas as disposições da Consolidação das Leis do Trabalho (CLT) e demais normas trabalhistas vigentes.

E, por estarem assim justos e contratados, firmam o presente em 2 (duas) vias de igual teor.

{{cidade_contrato}}, {{data_hoje}}.


_________________________________________
EMPREGADORA
{{empresa_razao_social}}


_________________________________________
EMPREGADO(A)
{{nome}}
CPF: {{cpf}}',
  true
);