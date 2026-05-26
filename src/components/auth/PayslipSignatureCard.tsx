import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileSignature, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { hasUserSignature, SIGNATURE_CONSENT_TEXT } from "@/lib/userSignature";
import { Link } from "react-router-dom";

interface PendingReceipt {
  id: string;
  reference_year: number;
  reference_month: number;
  status: string;
  unsigned_file_path: string;
  net_pay: number;
  sent_at: string;
}

const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PayslipSignatureCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingReceipt[]>([]);
  const [hasSig, setHasSig] = useState<boolean | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingReceipt | null>(null);
  const [signing, setSigning] = useState(false);

  const load = async () => {
    setLoading(true);
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: emp } = await (supabase as any)
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const empId = (emp as any)?.id;
    if (!empId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("payroll_receipts")
      .select("id, reference_year, reference_month, status, unsigned_file_path, net_pay, sent_at")
      .eq("employee_id", empId)
      .neq("status", "signed")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar holerites", description: error.message, variant: "destructive" });
    } else {
      setRows((data as PendingReceipt[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    hasUserSignature().then(setHasSig);
    load();
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
      toast({ title: "Holerite assinado", description: "Assinatura registrada." });
      setConfirming(null);
      setPreviewUrl(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao assinar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <>
      {rows.map((r) => {
        const label = `${MONTHS_PT[r.reference_month - 1]} / ${r.reference_year}`;
        return (
          <Card key={r.id} className="border-warning/40">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="flex items-start gap-3 min-w-0">
                <div className="rounded-md p-2 shrink-0 bg-warning/10 text-warning">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    Holerite — {label}
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" /> Assinatura pendente
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Líquido {fmtBRL(r.net_pay)} • Enviado em {new Date(r.sent_at).toLocaleDateString("pt-BR")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openPdf(r.unsigned_file_path)}>
                Visualizar
              </Button>
              <Button
                size="sm"
                disabled={hasSig === false}
                onClick={() => setConfirming(r)}
              >
                Ler e assinar
              </Button>
              {hasSig === false && (
                <Link to="/area-colaborador" className="text-xs underline self-center">
                  Cadastre sua assinatura
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 sm:p-6">
          <DialogHeader className="px-4 pt-4 sm:p-0">
            <DialogTitle>Visualizar holerite</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe src={previewUrl} className="w-full flex-1 rounded border" title="Holerite" />
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}
