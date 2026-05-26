import { ShieldCheck, FileText } from "lucide-react";

interface LegalPageProps {
  variant: "terms" | "privacy";
}

export default function LegalPage({ variant }: LegalPageProps) {
  const isTerms = variant === "terms";
  const title = isTerms ? "Termos de Uso" : "Política de Privacidade";
  const Icon = isTerms ? FileText : ShieldCheck;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-6 flex items-center gap-3">
          <Icon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
            <p className="text-xs text-muted-foreground">NEXA — Plataforma de Gestão · Aquela Parmê</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6 text-sm text-foreground">
        <p className="text-muted-foreground">
          Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).
        </p>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">1. Aceitação dos Termos</h2>
          <p>
            Ao criar uma conta e utilizar esta plataforma de gestão de pessoas (NEXA),
            você declara ter lido, compreendido e concordado integralmente com estes
            Termos de Uso e com a Política de Privacidade descrita abaixo.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">2. Finalidade do Tratamento de Dados</h2>
          <p>Seus dados pessoais serão tratados com as seguintes finalidades:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Cumprimento de obrigações trabalhistas, previdenciárias e fiscais;</li>
            <li>Gestão da relação de trabalho (admissão, jornada, férias, folha de pagamento);</li>
            <li>Avaliações de desempenho, treinamentos e plano de carreira;</li>
            <li>Controle de ponto, biometria facial e autenticação segura;</li>
            <li>Comunicações internas, avisos, escalas e tarefas;</li>
            <li>Gestão de avaliações de clientes e relacionamento com plataformas externas
              (como Google Business Profile e iFood) para responder a feedbacks e melhorar
              a experiência do consumidor;</li>
            <li>Cumprimento de exigências legais e regulatórias.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">3. Dados Coletados</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Identificação:</strong> nome, CPF, RG, data de nascimento, foto;</li>
            <li><strong>Contato:</strong> e-mail, telefone, endereço;</li>
            <li><strong>Profissionais:</strong> cargo, salário, jornada, histórico funcional;</li>
            <li><strong>Bancários:</strong> dados para pagamento (conta, PIX);</li>
            <li><strong>Biométricos:</strong> reconhecimento facial e/ou impressão digital;</li>
            <li><strong>Sensíveis:</strong> atestados médicos, dependentes (apenas quando
              necessários ao vínculo trabalhista);</li>
            <li><strong>Integrações externas:</strong> tokens OAuth e dados de avaliações
              públicas obtidos via APIs autorizadas (Google Business Profile, iFood).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">4. Base Legal (Art. 7º e 11 da LGPD)</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Cumprimento de obrigação legal ou regulatória;</li>
            <li>Execução de contrato de trabalho;</li>
            <li>Legítimo interesse do empregador;</li>
            <li>Consentimento expresso (para dados biométricos e finalidades específicas).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">5. Compartilhamento de Dados</h2>
          <p>Seus dados poderão ser compartilhados apenas com:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Órgãos governamentais (eSocial, Receita Federal, INSS, Ministério do Trabalho);</li>
            <li>Instituições financeiras (para pagamento de salários e benefícios);</li>
            <li>Prestadores de serviços contratados sob acordo de confidencialidade;</li>
            <li>Autoridades judiciais ou administrativas, quando exigido por lei.</li>
          </ul>
          <p>
            <strong>Seus dados não serão vendidos nem utilizados para fins de marketing
            de terceiros.</strong>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">6. Uso de APIs do Google</h2>
          <p>
            O uso e a transferência, para qualquer outro aplicativo, de informações
            recebidas das APIs do Google aderirão à{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">7. Armazenamento e Segurança</h2>
          <p>
            Os dados são armazenados em servidores seguros, com criptografia em trânsito
            e em repouso. O período de retenção segue os prazos legais aplicáveis.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">8. Seus Direitos (Art. 18 da LGPD)</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Confirmar a existência de tratamento de seus dados;</li>
            <li>Acessar, corrigir, anonimizar, bloquear ou eliminar dados;</li>
            <li>Solicitar portabilidade;</li>
            <li>Revogar o consentimento, quando aplicável.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-base">9. Contato — Encarregado de Dados (DPO)</h2>
          <p>
            Para exercer seus direitos ou tirar dúvidas sobre o tratamento de dados:
            <br />
            <strong>E-mail:</strong>{" "}
            <a href="mailto:contato@aquelaparme.com.br" className="text-primary underline">
              contato@aquelaparme.com.br
            </a>
          </p>
        </section>

        <p className="text-xs text-muted-foreground pt-6 border-t">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>
      </main>
    </div>
  );
}
