import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, ScrollText, FileText, AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { generateInternalRegulationPdf } from "@/lib/internalRegulation";
import {
  PositionTerm,
  generatePositionTermPdf,
  getTermsForPosition,
} from "@/lib/positionTerms";
import { downloadLgpdConsentPdf } from "@/lib/lgpdConsent";
import { downloadCustomDocumentPdf } from "@/lib/customDocumentPdf";
import ContractSignatureCard from "@/components/auth/ContractSignatureCard";
import InternshipContractCard from "@/components/auth/InternshipContractCard";
import EmployeeMedicalCertificateUpload from "@/components/auth/EmployeeMedicalCertificateUpload";
import InternalRegulationCard from "@/components/auth/InternalRegulationCard";
import PositionTermCard from "@/components/auth/PositionTermCard";
import CustomDocumentsCards from "@/components/auth/CustomDocumentsCards";
import TrainingReceiptSignatureCard from "@/components/auth/TrainingReceiptSignatureCard";
import PayslipSignatureCard from "@/components/auth/PayslipSignatureCard";
import { generateTrainingReceiptPdf } from "@/lib/trainingReceiptPdf";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";

interface EmployeeDocumentsTabProps {
  employeeId: string;
  employeeName: string;
  employeeCpf?: string | null;
  employeePosition?: string | null;
  employeeContractType?: string | null;
}

interface RegulationAcceptance {
  id: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  regulation_version: string;
}

interface PositionTermAcceptance {
  id: string;
  term_key: string;
  term_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface LgpdConsent {
  id: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface CustomDocSignature {
  signature_id: string;
  document_id: string;
  title: string;
  version_number: number;
  signed_at: string;
}

export default function EmployeeDocumentsTab({
  employeeId,
  employeeName,
  employeeCpf,
  employeePosition,
  employeeContractType,
}: EmployeeDocumentsTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [regulation, setRegulation] = useState<RegulationAcceptance | null>(null);
  const [termAcceptances, setTermAcceptances] = useState<PositionTermAcceptance[]>([]);
  const [lgpd, setLgpd] = useState<LgpdConsent | null>(null);
  const [customSignatures, setCustomSignatures] = useState<CustomDocSignature[]>([]);
  const [signedReceipts, setSignedReceipts] = useState<any[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<{
    pending: boolean;
    signed: boolean;
    signedAt: string | null;
    download: (() => Promise<void>) | null;
    downloading: boolean;
  }>({ pending: false, signed: false, signedAt: null, download: null, downloading: false });
  const positionTerms: PositionTerm[] = getTermsForPosition(employeePosition);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: regData }, { data: termsData }, { data: lgpdData }, { data: customSigs }, { data: recs }] =
        await Promise.all([
          supabase
            .from("internal_regulation_acceptances")
            .select("id, accepted_at, ip_address, user_agent, regulation_version")
            .eq("user_id", user.id)
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("position_term_acceptances")
            .select("id, term_key, term_version, accepted_at, ip_address, user_agent")
            .eq("user_id", user.id)
            .order("accepted_at", { ascending: false }),
          supabase
            .from("lgpd_consents")
            .select("id, accepted_at, ip_address, user_agent")
            .eq("user_id", user.id)
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("custom_document_signatures")
            .select("id, document_id, version_number, signed_at, custom_documents(title)")
            .eq("user_id", user.id)
            .order("signed_at", { ascending: false }),
          (supabase as any)
            .from("training_receipts")
            .select("id, training_start, training_end, worked_days, monthly_salary, daily_rate, total_amount, signed_at")
            .eq("employee_id", employeeId)
            .not("signed_at", "is", null)
            .order("signed_at", { ascending: false }),
        ]);
      setRegulation(regData ?? null);
      setTermAcceptances(termsData ?? []);
      setLgpd((lgpdData as LgpdConsent | null) ?? null);
      setCustomSignatures(
        ((customSigs ?? []) as any[]).map((s) => ({
          signature_id: s.id,
          document_id: s.document_id,
          title: s.custom_documents?.title ?? "Documento personalizado",
          version_number: s.version_number,
          signed_at: s.signed_at,
        })),
      );
      setSignedReceipts((recs ?? []) as any[]);
      setLoading(false);
    })();
  }, [user, employeeId, employeePosition]);

  const handleDownloadLgpd = async () => {
    if (!lgpd) return;
    setDownloading("lgpd");
    try {
      await downloadLgpdConsentPdf({
        employeeName,
        employeeCpf,
        acceptedAt: new Date(lgpd.accepted_at),
        ipAddress: lgpd.ip_address,
        userAgent: lgpd.user_agent,
      });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadRegulation = async () => {
    if (!regulation) return;
    setDownloading("regulation");
    try {
      await generateInternalRegulationPdf({
        employeeName,
        employeeCpf,
        acceptedAt: new Date(regulation.accepted_at),
        ipAddress: regulation.ip_address,
        userAgent: regulation.user_agent,
      });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadTerm = async (term: PositionTerm, acceptance: PositionTermAcceptance) => {
    setDownloading(term.key);
    try {
      await generatePositionTermPdf({
        term,
        employeeName,
        employeeCpf,
        acceptedAt: new Date(acceptance.accepted_at),
        ipAddress: acceptance.ip_address,
        userAgent: acceptance.user_agent,
      });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadCustomDoc = async (signatureId: string) => {
    setDownloading(`custom:${signatureId}`);
    try {
      await downloadCustomDocumentPdf({ signatureId });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadReceipt = async (r: any) => {
    setDownloading(`rec:${r.id}`);
    try {
      const sig = await getCurrentUserSignatureDataUrl();
      const doc = generateTrainingReceiptPdf({
        employee_name: employeeName,
        employee_cpf: employeeCpf ?? null,
        position: employeePosition ?? null,
        training_start: r.training_start,
        training_end: r.training_end,
        worked_days: r.worked_days,
        monthly_salary: Number(r.monthly_salary),
        daily_rate: Number(r.daily_rate),
        total_amount: Number(r.total_amount),
        signature_data_url: sig,
        signed_at: r.signed_at,
      });
      const safeName = employeeName.replace(/[^\w]+/g, "_");
      doc.save(`recibo-treinamento-${safeName}-${r.training_start}.pdf`);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const signedDocs: Array<{
    key: string;
    title: string;
    subtitle: string;
    onDownload: () => void;
    isDownloading?: boolean;
  }> = [];

  if (contractStatus.signed && contractStatus.download) {
    signedDocs.push({
      key: "contract",
      title: "Contrato Individual de Trabalho",
      subtitle: contractStatus.signedAt
        ? `Assinado em ${new Date(contractStatus.signedAt).toLocaleString("pt-BR")}`
        : "Assinado",
      onDownload: () => contractStatus.download?.(),
      isDownloading: contractStatus.downloading,
    });
  }
  if (lgpd) {
    signedDocs.push({
      key: "lgpd",
      title: "Termo de Consentimento LGPD",
      subtitle: `Aceito em ${new Date(lgpd.accepted_at).toLocaleString("pt-BR")}`,
      onDownload: handleDownloadLgpd,
    });
  }
  if (regulation) {
    signedDocs.push({
      key: "regulation",
      title: "Regimento Interno",
      subtitle: `Assinado em ${new Date(regulation.accepted_at).toLocaleString("pt-BR")} • Versão ${regulation.regulation_version}`,
      onDownload: handleDownloadRegulation,
    });
  }
  positionTerms.forEach((term) => {
    const acceptance = termAcceptances.find(
      (a) => a.term_key === term.key && a.term_version === term.version,
    );
    if (acceptance) {
      signedDocs.push({
        key: term.key,
        title: term.title,
        subtitle: `Assinado em ${new Date(acceptance.accepted_at).toLocaleString("pt-BR")} • Versão ${acceptance.term_version}`,
        onDownload: () => handleDownloadTerm(term, acceptance),
      });
    }
  });
  customSignatures.forEach((s) => {
    signedDocs.push({
      key: `custom:${s.signature_id}`,
      title: s.title,
      subtitle: `Assinado em ${new Date(s.signed_at).toLocaleString("pt-BR")} • Versão ${s.version_number}`,
      onDownload: () => handleDownloadCustomDoc(s.signature_id),
    });
  });
  signedReceipts.forEach((r) => {
    signedDocs.push({
      key: `rec:${r.id}`,
      title: `Recibo de treinamento (${new Date(r.training_start).toLocaleDateString("pt-BR")} a ${new Date(r.training_end).toLocaleDateString("pt-BR")})`,
      subtitle: `Assinado em ${new Date(r.signed_at).toLocaleString("pt-BR")}`,
      onDownload: () => handleDownloadReceipt(r),
    });
  });

  const isIntern = (() => {
    const v = (employeeContractType ?? "").toLowerCase();
    return v.includes("estág") || v.includes("estag") || v === "internship";
  })();

  return (
    <div className="space-y-4">
      {/* Envio de atestado médico pelo colaborador */}
      <EmployeeMedicalCertificateUpload employeeId={employeeId} />

      {/* Contrato Individual de Trabalho — não se aplica a estagiários (que têm Termo de Estágio próprio) */}
      {!isIntern && (
        <ContractSignatureCard
          employeeId={employeeId}
          hideWhenSigned
          onStatusChange={setContractStatus}
        />
      )}

      {/* Termo de Compromisso de Estágio — upload do documento já assinado pelas três partes */}
      {isIntern && <InternshipContractCard employeeId={employeeId} />}

      {/* Regimento Interno (auto-oculta quando assinado) */}
      <InternalRegulationCard
        employeeId={employeeId}
        employeeName={employeeName}
        employeeCpf={employeeCpf}
      />

      {/* Termos específicos do cargo (auto-ocultam quando assinados) */}
      {positionTerms.map((term) => (
        <PositionTermCard
          key={term.key}
          employeeId={employeeId}
          employeeName={employeeName}
          employeeCpf={employeeCpf}
          term={term}
        />
      ))}

      {/* Documentos personalizados pendentes */}
      <CustomDocumentsCards employeeId={employeeId} employeePosition={employeePosition} />

      {/* Recibos de treinamento aguardando assinatura */}
      <TrainingReceiptSignatureCard employeeId={employeeId} />

      {/* Holerites pendentes de assinatura */}
      <PayslipSignatureCard />

      {/* Meus documentos – lista simplificada para download */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="h-5 w-5" /> Meus documentos
          </CardTitle>
          <CardDescription>
            Acesse e baixe os documentos que você assinou na empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : signedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não possui documentos assinados disponíveis para download.
            </p>
          ) : (
            <ul className="divide-y">
              {signedDocs.map((d) => (
                <li
                  key={d.key}
                  className="py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.subtitle}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={d.onDownload}
                    disabled={downloading === d.key || d.isDownloading}
                    className="gap-1 shrink-0"
                  >
                    <FileDown className="h-4 w-4" />
                    {downloading === d.key || d.isDownloading ? "Gerando..." : "Baixar"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
