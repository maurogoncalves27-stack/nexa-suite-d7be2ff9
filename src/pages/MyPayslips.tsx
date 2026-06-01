import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ReceiptText, FileSignature, Download, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { hasUserSignature, SIGNATURE_CONSENT_TEXT } from "@/lib/userSignature";
import { Link } from "react-router-dom";

interface ReceiptRow {
  id: string;
  reference_year: number;
  reference_month: number;
  status: string;
  unsigned_file_path: string;
  signed_file_path: string | null;
  net_pay: number;
  signed_at: string | null;
  sent_at: string;
}

const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MyPayslips() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [hasSig, setHasSig] = useState<boolean | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ReceiptRow | null>(null);
  const [signing, setSigning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("payroll_receipts")
      .select("id, reference_year, reference_month, status, unsigned_file_path, signed_file_path, net_pay, signed_at, sent_at")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar holerites", description: error.message, variant: "destructive" });
    } else {
      setRows((data as ReceiptRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    hasUserSignature().then(setHasSig);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("payroll-receipts")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: error?.message || "Falha ao abrir", variant: "destructive" });
      return;
    }
    setPreviewUrl(data.signedUrl);
  };

  const downloadPdf = async (path: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from("payroll-receipts")
      .createSignedUrl(path, 60 * 5, { download: fileName });
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: error?.message || "Falha ao baixar", variant: "destructive" });
      return;
    }
    window.location.href = data.signedUrl;
  };

  const sign = async () => {
    if (!confirming) return;
    setSigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-payslip", {
        body: { receipt_id: confirming.id },
      });
      if (error) throw error;
      const d: any = data;
      if (d?.error) throw new Error(d.error);
      toast({ title: "Holerite assinado", description: "PDF assinado salvo na sua pasta." });
      setConfirming(null);
      setPreviewUrl(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao assinar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <ReceiptText className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" /> Meus holerites
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Visualize e assine os holerites enviados pela empresa.
        </p>
      </div>

      {hasSig === false && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm">
            Para assinar holerites, você precisa primeiro cadastrar sua assinatura visual.{" "}
            <Link to="/area-colaborador" className="underline font-medium">
              Ir para minha área
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum holerite enviado ainda.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const label = `${MONTHS_PT[r.reference_month - 1]} / ${r.reference_year}`;
                const fileName = `Holerite ${String(r.reference_month).padStart(2,"0")}-${r.reference_year}.pdf`;
                const path = r.signed_file_path ?? r.unsigned_file_path;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-md p-3"
                  >
                    <div className="flex flex-col">
                      <div className="font-medium flex items-center gap-2">
                        {label}
                        {r.status === "signed" ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Assinado
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Líquido: {fmtBRL(r.net_pay)} · Enviado em {new Date(r.sent_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => openPdf(path)}>
                        Visualizar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadPdf(path, fileName)}>
                        <Download className="h-4 w-4 mr-1" /> Baixar
                      </Button>
                      {r.status !== "signed" && (
                        <Button
                          size="sm"
                          disabled={hasSig === false}
                          onClick={() => setConfirming(r)}
                        >
                          <FileSignature className="h-4 w-4 mr-1" /> Assinar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pré-visualização */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Visualizar holerite</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe src={previewUrl} className="w-full flex-1 rounded border" title="Holerite" />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de assinatura */}
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar assinatura</DialogTitle>
          </DialogHeader>
          {confirming && (
            <div className="space-y-3 text-sm">
              <p>
                Você está assinando o holerite de{" "}
                <strong>{MONTHS_PT[confirming.reference_month - 1]}/{confirming.reference_year}</strong>{" "}
                no valor líquido de <strong>{fmtBRL(confirming.net_pay)}</strong>.
              </p>
              <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
                {SIGNATURE_CONSENT_TEXT}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={signing}>
              Cancelar
            </Button>
            <Button onClick={sign} disabled={signing}>
              {signing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Assinar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
