import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, FileText, Building2, Calendar, Hash, User, Globe } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface VerifyResponse {
  valid: boolean;
  doc_type: string;
  doc_label: string;
  signer_name: string;
  signer_cpf_masked: string | null;
  signed_at: string;
  content_hash: string | null;
  ip_masked: string | null;
  company_name: string | null;
  superseded: boolean;
  error?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Contrato de Trabalho",
  custom_doc: "Documento Personalizado",
  warning: "Advertência",
  regulation: "Regimento Interno",
  position_term: "Termo de Cargo",
};

export default function VerifySignature() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!type || !id) {
      setError("Link inválido");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: resp, error: fnErr } = await supabase.functions.invoke("verify-signature", {
          body: null,
          method: "GET",
          // Edge SDK não suporta query string nativamente em invoke; usamos fetch direto:
        });
        // Fallback: chamada direta via fetch (mantendo simplicidade)
        if (!resp || fnErr) {
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
          const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
          const r = await fetch(
            `${SUPABASE_URL}/functions/v1/verify-signature?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
            { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
          );
          const j = (await r.json()) as VerifyResponse;
          if (!r.ok) {
            setError(j.error || "Documento não encontrado");
          } else {
            setData(j);
          }
        } else {
          setData(resp as VerifyResponse);
        }
      } catch (e: any) {
        setError(e?.message ?? "Erro ao verificar documento");
      } finally {
        setLoading(false);
      }
    })();
  }, [type, id]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Verificação de Autenticidade</h1>
        </div>

        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          {loading ? (
            <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Verificando documento...</p>
            </CardContent>
          ) : error || !data?.valid ? (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="text-destructive">Documento não encontrado</CardTitle>
              </CardHeader>
              <CardContent className="text-center text-sm text-muted-foreground pb-6">
                <p>{error ?? "Não foi possível localizar este documento. Verifique se o link/QR Code está correto."}</p>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-14 w-14 rounded-full bg-success/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <CardTitle className="text-success">Documento Autêntico</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Assinado eletronicamente conforme MP 2.200-2/2001
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {data.superseded && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/10 p-3">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-warning">Versão substituída</p>
                      <p className="text-muted-foreground">
                        Este documento foi substituído por uma versão mais recente, mas o registro original permanece válido na data em que foi assinado.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {DOC_TYPE_LABELS[data.doc_type] ?? data.doc_type}
                  </Badge>
                </div>

                <Row icon={<FileText className="h-4 w-4" />} label="Documento" value={data.doc_label} />
                <Separator />
                <Row icon={<User className="h-4 w-4" />} label="Assinado por" value={data.signer_name} />
                {data.signer_cpf_masked && (
                  <Row icon={<User className="h-4 w-4" />} label="CPF (parcial)" value={data.signer_cpf_masked} />
                )}
                {data.company_name && (
                  <Row icon={<Building2 className="h-4 w-4" />} label="Empresa" value={data.company_name} />
                )}
                <Separator />
                <Row
                  icon={<Calendar className="h-4 w-4" />}
                  label="Data/Hora da assinatura"
                  value={new Date(data.signed_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZoneName: "short",
                  })}
                />
                {data.ip_masked && (
                  <Row icon={<Globe className="h-4 w-4" />} label="IP de origem" value={data.ip_masked} />
                )}
                {data.content_hash && (
                  <Row
                    icon={<Hash className="h-4 w-4" />}
                    label="Hash SHA-256"
                    value={data.content_hash}
                    mono
                  />
                )}

                <Separator />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Para confirmar a integridade, compare o hash acima com o hash do PDF que você possui.
                  Se forem idênticos, o documento não foi alterado desde a assinatura.
                </p>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          NEXA — Sistema de Gestão de Pessoas
        </p>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
