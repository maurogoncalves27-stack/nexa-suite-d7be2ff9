import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNr1Metrics } from "./useNr1Metrics";
import { generateOccupationalHealthReportPdf } from "@/lib/occupationalHealthReportPdf";
import { format } from "date-fns";

export default function ExportOhReportButton() {
  const { data: metrics } = useNr1Metrics();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!metrics) {
      toast({ title: "Aguarde", description: "Métricas ainda carregando." });
      return;
    }
    setLoading(true);
    try {
      const [risksRes, sstRes] = await Promise.all([
        supabase.from("psychosocial_risks")
          .select("category, severity, status, description, action_plan, resolution_notes, deadline, resolved_at, auto_generated")
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("sst_documents")
          .select("doc_type, company_name, valid_from, valid_until, is_active")
          .eq("is_active", true)
          .order("valid_until", { ascending: true, nullsFirst: false }),
      ]);
      if (risksRes.error) throw risksRes.error;
      if (sstRes.error) throw sstRes.error;

      const sstDocs = (sstRes.data ?? []).map((d: any) => ({
        title: d.company_name ? `${d.doc_type} — ${d.company_name}` : d.doc_type,
        document_type: d.doc_type,
        valid_until: d.valid_until,
        is_active: d.is_active,
      }));

      const doc = generateOccupationalHealthReportPdf(metrics, {
        psychoRisks: (risksRes.data ?? []) as any,
        sstDocs: sstDocs as any,
        companyName: "NEXA Gestão Inteligente",
      });
      doc.save(`relatorio-saude-ocupacional-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "Relatório gerado", description: "PDF pronto para apresentação ao Ministério do Trabalho." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
      Exportar PDF (fiscalização)
    </Button>
  );
}
