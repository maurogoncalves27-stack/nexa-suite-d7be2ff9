import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import { classifySstDocument, matchEmployeeFromClassification, type SmartClassifyResult } from "@/lib/sstSmartUpload";
import { uploadEmployeePdfBlob } from "@/lib/employeeDocUpload";

type DocType =
  | "pcmso"
  | "pgr"
  | "ltcat"
  | "ltip"
  | "psicossocial_nr1"
  | "relatorio_psicossocial"
  | "outros";

const DOC_TYPE_META: Record<DocType, { short: string; defaultValidityMonths: number | null }> = {
  pcmso: { short: "PCMSO", defaultValidityMonths: 12 },
  pgr: { short: "PGR", defaultValidityMonths: 24 },
  ltcat: { short: "LTCAT", defaultValidityMonths: null },
  ltip: { short: "LTIP", defaultValidityMonths: null },
  psicossocial_nr1: { short: "Psicossocial NR-1", defaultValidityMonths: 12 },
  relatorio_psicossocial: { short: "Relatório Psicossocial", defaultValidityMonths: 12 },
  outros: { short: "Outros", defaultValidityMonths: 12 },
};

function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function SstSmartUploadButton({ variant = "secondary" }: { variant?: "secondary" | "outline" | "default" }) {
  const { user } = useAuth();
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartClassifyResult | null>(null);
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartEmployee, setSmartEmployee] = useState<{ id: string; full_name: string } | null>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartConfirming, setSmartConfirming] = useState(false);

  const handleSmartUpload = async (f: File) => {
    setSmartLoading(true);
    setSmartFile(f);
    setSmartResult(null);
    setSmartEmployee(null);
    setSmartOpen(true);
    try {
      const result = await classifySstDocument(f);
      setSmartResult(result);
      if (result.kind === "aso") {
        const match = await matchEmployeeFromClassification(result);
        setSmartEmployee(match);
      }
    } catch (e: any) {
      toast({ title: "Falha ao analisar PDF", description: e.message ?? String(e), variant: "destructive" });
      setSmartOpen(false);
    } finally {
      setSmartLoading(false);
    }
  };

  const confirmSmart = async () => {
    if (!smartFile || !smartResult) return;
    setSmartConfirming(true);
    try {
      if (smartResult.kind === "aso") {
        if (!smartEmployee) {
          toast({
            title: "Colaborador não identificado",
            description: "Não foi possível casar o nome/CPF do ASO com um colaborador cadastrado.",
            variant: "destructive",
          });
          setSmartConfirming(false);
          return;
        }
        const cert = smartResult.emitted_at ?? new Date().toISOString().slice(0, 10);
        const path = `${smartEmployee.id}/aso-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("medical-certificates")
          .upload(path, smartFile, { contentType: "application/pdf" });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("medical_certificates").insert({
          employee_id: smartEmployee.id,
          certificate_date: cert,
          days_off: 0,
          doctor_name: smartResult.doctor_name,
          doctor_crm: smartResult.doctor_crm,
          notes: smartResult.notes,
          file_path: path,
          file_name: smartFile.name,
          mime_type: "application/pdf",
          size_bytes: smartFile.size,
          created_by: user?.id ?? null,
          status: "approved",
          document_type: "aso",
          valid_until: smartResult.valid_until,
          is_pcmso: true,
        });
        if (insErr) throw insErr;

        await uploadEmployeePdfBlob({
          employeeId: smartEmployee.id,
          docType: "aso",
          fileName: smartFile.name,
          blob: smartFile,
          uploadedBy: user?.id ?? null,
        });

        toast({ title: `ASO arquivado na ficha de ${smartEmployee.full_name}` });
        window.dispatchEvent(new CustomEvent("sst-docs-changed"));
        setSmartOpen(false);
        return;
      }

      const kind = smartResult.kind === "outros" ? "outros" : smartResult.kind;
      const cnpjIn = smartResult.cnpj || "44.932.369/0001-08";
      const cnpjKey = cnpjIn.replace(/\D/g, "");
      const company = smartResult.company_name || "AQUELA PARMÊ";
      const today = new Date().toISOString().slice(0, 10);
      const emitted = smartResult.emitted_at ?? today;
      const vFrom = smartResult.valid_from ?? emitted;
      const months = DOC_TYPE_META[kind as DocType].defaultValidityMonths;
      const vUntil = smartResult.valid_until ?? (months ? addMonths(emitted, months) : null);

      const { data: existing } = await supabase
        .from("sst_documents")
        .select("*")
        .eq("doc_type", kind)
        .eq("cnpj", cnpjIn)
        .maybeSingle();

      let documentId = existing?.id as string | undefined;
      let versionNumber = 1;
      if (existing) {
        versionNumber = (existing.current_version ?? 1) + 1;
      } else {
        const { data: newDoc, error: insErr } = await supabase
          .from("sst_documents")
          .insert({
            doc_type: kind,
            cnpj: cnpjIn,
            company_name: company,
            emitted_at: emitted,
            valid_from: vFrom,
            valid_until: vUntil,
            notes: smartResult.notes,
            current_version: 1,
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        documentId = newDoc.id;
      }

      const path = `${cnpjKey}/${kind}/v${versionNumber}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("sst-documents")
        .upload(path, smartFile, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      const { error: vErr } = await supabase.from("sst_document_versions").insert({
        document_id: documentId,
        version_number: versionNumber,
        file_path: path,
        file_name: smartFile.name,
        file_size: smartFile.size,
        emitted_at: emitted,
        valid_from: vFrom,
        valid_until: vUntil,
        uploaded_by: user?.id ?? null,
      });
      if (vErr) throw vErr;

      if (existing) {
        await supabase
          .from("sst_document_versions")
          .update({ superseded_at: new Date().toISOString() })
          .eq("document_id", existing.id)
          .lt("version_number", versionNumber)
          .is("superseded_at", null);
        await supabase
          .from("sst_documents")
          .update({
            emitted_at: emitted,
            valid_from: vFrom,
            valid_until: vUntil,
            notes: smartResult.notes ?? existing.notes,
            current_version: versionNumber,
          })
          .eq("id", existing.id);
      }

      // Extrai riscos psicossociais/ocupacionais para PGR / Psicossocial NR-1 / LTCAT / Relatório
      const riskKinds: DocType[] = ["pgr", "psicossocial_nr1", "ltcat", "relatorio_psicossocial"];
      const risks = smartResult.risks ?? [];
      let riskInserted = 0;
      if (riskKinds.includes(kind as DocType) && risks.length > 0) {
        const rows = risks.map((r) => ({
          category: r.category || "outros",
          description: r.description,
          severity: (["low", "medium", "high"].includes(r.severity) ? r.severity : "medium"),
          probability: (["low", "medium", "high"].includes(r.probability) ? r.probability : "medium"),
          action_plan: r.action_plan,
          deadline: r.deadline,
          source: `documento:${DOC_TYPE_META[kind as DocType].short} v${versionNumber}`,
          auto_generated: true,
          status: "open",
          created_by: user?.id ?? null,
        }));
        const { error: rErr, count } = await supabase
          .from("psychosocial_risks")
          .insert(rows, { count: "exact" });
        if (!rErr) riskInserted = count ?? rows.length;
        else console.warn("[psychosocial_risks insert]", rErr);
      }

      toast({
        title: existing
          ? `Nova versão v${versionNumber} de ${DOC_TYPE_META[kind as DocType].short} enviada`
          : `${DOC_TYPE_META[kind as DocType].short} cadastrado`,
        description: riskInserted > 0 ? `${riskInserted} risco(s) sugerido(s) em NR-1 → Riscos psicossociais.` : undefined,
      });
      window.dispatchEvent(new CustomEvent("sst-docs-changed"));
      setSmartOpen(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSmartConfirming(false);
    }
  };

  return (
    <>
      <Button variant={variant} asChild>
        <label className="cursor-pointer">
          <Sparkles className="h-4 w-4 mr-2" />
          Upload inteligente (IA)
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSmartUpload(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </Button>

      <Dialog open={smartOpen} onOpenChange={(v) => { if (!smartConfirming) setSmartOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Análise automática do PDF
            </DialogTitle>
          </DialogHeader>
          {smartLoading || !smartResult ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              A IA está lendo o documento…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge>{smartResult.kind === "aso" ? "ASO (ficha do colaborador)" : DOC_TYPE_META[smartResult.kind as DocType]?.short ?? smartResult.kind}</Badge>
                  <span className="text-xs text-muted-foreground">confiança {(smartResult.confidence * 100).toFixed(0)}%</span>
                </div>
                {smartResult.kind === "aso" ? (
                  <>
                    <div><b>Colaborador identificado:</b>{" "}
                      {smartEmployee ? (
                        <span className="text-success">{smartEmployee.full_name}</span>
                      ) : (
                        <span className="text-destructive">
                          {smartResult.employee_name ?? "(não detectado)"} — sem correspondência no cadastro
                        </span>
                      )}
                    </div>
                    {smartResult.aso_type && <div><b>Tipo:</b> {smartResult.aso_type}</div>}
                    {smartResult.aso_result && <div><b>Resultado:</b> {smartResult.aso_result}</div>}
                    {smartResult.doctor_name && <div><b>Médico:</b> {smartResult.doctor_name}{smartResult.doctor_crm ? ` (${smartResult.doctor_crm})` : ""}</div>}
                    {smartResult.emitted_at && <div><b>Emitido:</b> {new Date(smartResult.emitted_at).toLocaleDateString("pt-BR")}</div>}
                    {smartResult.valid_until && <div><b>Validade:</b> {new Date(smartResult.valid_until).toLocaleDateString("pt-BR")}</div>}
                  </>
                ) : (
                  <>
                    {smartResult.company_name && <div><b>Empresa:</b> {smartResult.company_name}</div>}
                    {smartResult.cnpj && <div><b>CNPJ:</b> {smartResult.cnpj}</div>}
                    {smartResult.emitted_at && <div><b>Emitido:</b> {new Date(smartResult.emitted_at).toLocaleDateString("pt-BR")}</div>}
                    {smartResult.valid_from && <div><b>Vigência:</b> {new Date(smartResult.valid_from).toLocaleDateString("pt-BR")}{smartResult.valid_until ? ` → ${new Date(smartResult.valid_until).toLocaleDateString("pt-BR")}` : ""}</div>}
                    {smartResult.notes && <div className="text-muted-foreground text-xs">{smartResult.notes}</div>}
                  </>
                )}
              </div>
              {smartResult.kind !== "aso" && smartResult.risks && smartResult.risks.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs font-semibold">
                    {smartResult.risks.length} risco(s) identificado(s) — serão criados como sugestão em NR-1 → Riscos psicossociais
                  </div>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {smartResult.risks.slice(0, 8).map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <Badge variant="outline" className="shrink-0">{r.severity}</Badge>
                        <span className="line-clamp-2">{r.description}</span>
                      </li>
                    ))}
                    {smartResult.risks.length > 8 && (
                      <li className="text-muted-foreground">+ {smartResult.risks.length - 8} adicionais…</li>
                    )}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {smartResult.kind === "aso"
                  ? "O arquivo será arquivado na pasta do colaborador e aparecerá na aba ASO."
                  : `O documento será cadastrado em Documentos SST como ${DOC_TYPE_META[(smartResult.kind as DocType) ?? "outros"]?.short ?? "SST"}. Se já existir um do mesmo tipo/CNPJ, entra como nova versão.`}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmartOpen(false)} disabled={smartConfirming}>Cancelar</Button>
            <Button
              onClick={confirmSmart}
              disabled={smartConfirming || smartLoading || !smartResult || (smartResult?.kind === "aso" && !smartEmployee)}
            >
              {smartConfirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
