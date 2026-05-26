import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck } from "lucide-react";

interface LgpdTermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LgpdTermsDialog({ open, onOpenChange }: LgpdTermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Termos de Uso e Política de Privacidade (LGPD)
          </DialogTitle>
          <DialogDescription>
            Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm text-foreground">
            <section className="space-y-2">
              <h3 className="font-semibold text-base">1. Aceitação dos Termos</h3>
              <p>
                Ao criar uma conta e utilizar esta plataforma de gestão de pessoas (NEXA),
                você declara ter lido, compreendido e concordado integralmente com estes
                Termos de Uso e com a Política de Privacidade descrita abaixo, em conformidade
                com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">2. Finalidade do Tratamento de Dados</h3>
              <p>
                Seus dados pessoais serão tratados com as seguintes finalidades:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Cumprimento de obrigações trabalhistas, previdenciárias e fiscais;</li>
                <li>Gestão da relação de trabalho (admissão, jornada, férias, folha de pagamento);</li>
                <li>Avaliações de desempenho, treinamentos e plano de carreira;</li>
                <li>Controle de ponto, biometria facial e autenticação segura;</li>
                <li>Comunicações internas, avisos, escalas e tarefas;</li>
                <li>Cumprimento de exigências legais e regulatórias.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">3. Dados Coletados</h3>
              <p>
                Coletamos e tratamos os seguintes dados, conforme aplicável:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Identificação:</strong> nome, CPF, RG, data de nascimento, foto;</li>
                <li><strong>Contato:</strong> e-mail, telefone, endereço;</li>
                <li><strong>Profissionais:</strong> cargo, salário, jornada, histórico funcional;</li>
                <li><strong>Bancários:</strong> dados para pagamento (conta, PIX);</li>
                <li><strong>Biométricos:</strong> reconhecimento facial e/ou impressão digital
                  (com base no consentimento e finalidade de autenticação);</li>
                <li><strong>Sensíveis:</strong> atestados médicos, dados de dependentes
                  (apenas quando necessários ao vínculo trabalhista).</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">4. Base Legal (Art. 7º e 11 da LGPD)</h3>
              <p>
                O tratamento de seus dados está fundamentado em:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Cumprimento de obrigação legal ou regulatória;</li>
                <li>Execução de contrato de trabalho;</li>
                <li>Legítimo interesse do empregador;</li>
                <li>Consentimento expresso (para dados biométricos e finalidades específicas).</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">5. Compartilhamento de Dados</h3>
              <p>
                Seus dados poderão ser compartilhados apenas com:
              </p>
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
              <h3 className="font-semibold text-base">6. Armazenamento e Segurança</h3>
              <p>
                Os dados são armazenados em servidores seguros, com criptografia em trânsito
                e em repouso. Adotamos medidas técnicas e administrativas para proteger seus
                dados contra acesso não autorizado, perda ou vazamento. O período de
                retenção segue os prazos legais aplicáveis (mínimo de 5 anos após o término
                do vínculo, conforme legislação trabalhista).
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">7. Seus Direitos (Art. 18 da LGPD)</h3>
              <p>Você tem o direito de:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Confirmar a existência de tratamento de seus dados;</li>
                <li>Acessar seus dados a qualquer momento;</li>
                <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
                <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;</li>
                <li>Solicitar a portabilidade dos dados a outro fornecedor;</li>
                <li>Revogar o consentimento, quando aplicável;</li>
                <li>Obter informações sobre o compartilhamento de seus dados.</li>
              </ul>
              <p>
                Para exercer seus direitos, entre em contato com o Departamento de Recursos
                Humanos ou com o Encarregado de Dados (DPO) da empresa.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">8. Uso da Plataforma</h3>
              <p>
                O usuário compromete-se a:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Manter sigilo sobre suas credenciais de acesso;</li>
                <li>Utilizar a plataforma apenas para finalidades profissionais legítimas;</li>
                <li>Não compartilhar acesso com terceiros;</li>
                <li>Comunicar imediatamente qualquer suspeita de uso indevido.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">9. Uso de Dispositivo Pessoal (BYOD)</h3>
              <p>
                Você autoriza expressamente o uso de seu dispositivo pessoal (smartphone,
                tablet ou computador) para acessar o sistema de gestão da empresa, incluindo
                funcionalidades como registro de ponto, reconhecimento facial, recebimento
                de notificações, consulta de escalas, contracheques, avisos e demais módulos.
              </p>
              <p>Você declara estar ciente de que:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>O uso do dispositivo pessoal é <strong>voluntário</strong> e configura
                  facilidade operacional para ambas as partes;</li>
                <li>A empresa <strong>não terá acesso</strong> a dados pessoais armazenados
                  no dispositivo (fotos, contatos, mensagens, aplicativos pessoais);</li>
                <li>Apenas dados estritamente necessários ao funcionamento do sistema
                  (localização aproximada para ponto, imagem facial para autenticação,
                  token de notificação push) serão coletados, sempre com finalidade definida;</li>
                <li>É responsabilidade do titular manter o dispositivo seguro (bloqueio de
                  tela, antivírus, sistema atualizado) para proteger seu próprio acesso;</li>
                <li>A empresa não se responsabiliza por custos de internet móvel, desgaste
                  do aparelho ou consumo de bateria decorrentes do uso profissional;</li>
                <li>Você pode revogar esta autorização a qualquer momento, ficando ciente
                  de que poderá ser necessário utilizar dispositivo fornecido pela empresa
                  ou ponto físico alternativo;</li>
                <li>Em caso de desligamento, perda ou troca do aparelho, o titular deve
                  comunicar o RH imediatamente para revogação dos acessos e remoção de credenciais.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">10. Registro do Consentimento</h3>
              <p>
                Ao aceitar estes termos, será registrado em nossa base de dados a data,
                hora, endereço IP e navegador utilizado, conforme exigido pelo Art. 8º
                da LGPD para comprovação do consentimento livre, informado e inequívoco.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-base">11. Alterações</h3>
              <p>
                Estes Termos podem ser atualizados a qualquer momento. Em caso de alterações
                materiais, você será notificado e poderá ser solicitado um novo aceite.
              </p>
            </section>

            <p className="text-xs text-muted-foreground pt-4 border-t">
              Última atualização: {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
