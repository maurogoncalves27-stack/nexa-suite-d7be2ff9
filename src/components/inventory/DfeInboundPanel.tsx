import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, RefreshCw, Settings, Archive, Inbox, CheckCircle2, Clock, AlertTriangle, FileUp, Upload, X } from "lucide-react";
import { toast } from "sonner";
import DfeConfigDialog from "./DfeConfigDialog";
import DfeNoteDialog from "./DfeNoteDialog";
import { InventoryReceivingPanel } from "./InventoryReceivingPanel";

interface DfeNote {
  id: string;
  supplier_name: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  emission_date: string | null;
  received_at: string;
  total_amount: number | null;
  status: string;
  origin: string;
  ciencia_at: string | null;
  raw_payload: any;
  target_store_id: string | null;
  _itemsCount?: number;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  awaiting_sefaz: { label: "Aguardando SEFAZ", cls: "bg-warning/15 text-warning border-warning/30" },
  ready: { label: "Pronta para processar", cls: "bg-success/15 text-success border-success/30" },
  imported: { label: "Importada", cls: "bg-primary/15 text-primary border-primary/30" },
  refused: { label: "Recusada", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  unknown: { label: "Desconhecida", cls: "bg-muted text-muted-foreground border-border" },
};

export default function DfeInboundPanel() {
  const [notes, setNotes] = useState<DfeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dfe_inbound_notes")
      .select("*")
      .in("status", ["awaiting_sefaz", "ready"])
      .order("received_at", { ascending: false })
      .limit(50);
    setNotes((data as DfeNote[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // KPIs
  const [kpis, setKpis] = useState({ pendentes: 0, ciencia: 0, valor: 0, hoje: 0 });
  const loadKpis = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [p, c, v, h] = await Promise.all([
      supabase.from("dfe_inbound_notes").select("id", { count: "exact", head: true }).eq("status", "ready"),
      supabase.from("dfe_inbound_notes").select("id", { count: "exact", head: true }).eq("status", "awaiting_sefaz"),
      supabase.from("dfe_inbound_notes").select("total_amount").in("status", ["awaiting_sefaz", "ready"]),
      supabase.from("dfe_inbound_notes").select("id", { count: "exact", head: true }).eq("status", "imported").gte("updated_at", today.toISOString()),
    ]);
    setKpis({
      pendentes: p.count ?? 0,
      ciencia: c.count ?? 0,
      valor: (v.data ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0),
      hoje: h.count ?? 0,
    });
  }, []);
  useEffect(() => { loadKpis(); }, [loadKpis, notes]);

  const syncNow = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("dfe-sync", { body: {} });
    setSyncing(false);
    if (error) return toast.error(error.message);
    const total = (data?.results ?? []).reduce((a: number, r: any) => a + (r.inserted ?? 0), 0);
    toast.success(`Sincronizado: ${total} nota(s) nova(s)`);
    load();
  };

  const refuseQuick = async (note: DfeNote, action: "refuse" | "unknown") => {
    const motivo = prompt(action === "refuse"
      ? "Justificativa (15-255 caracteres) para RECUSAR:"
      : "Justificativa (15-255 caracteres) para DESCONHECER:");
    if (!motivo) return;
    const { error } = await supabase.functions.invoke("dfe-action", {
      body: { note_id: note.id, action, justificativa: motivo },
    });
    if (error) toast.error(error.message);
    else { toast.success("Manifestação enviada"); load(); }
  };

  const fmtMoney = (v: number | null | undefined) =>
    v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const fmtMoneyK = (v: number) =>
    v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : fmtMoney(v);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Clock} label="Notas pendentes" value={kpis.pendentes} badge="Ação necessária" badgeCls="bg-warning/15 text-warning border-warning/30" />
        <KpiCard icon={Inbox} label="Aguardando ciência" value={kpis.ciencia.toString().padStart(2, "0")} badge="Fluxo SEFAZ" badgeCls="bg-primary/15 text-primary border-primary/30" />
        <KpiCard icon={AlertTriangle} label="Valor em trânsito" value={fmtMoneyK(kpis.valor)} badge="Estimado" badgeCls="bg-warning/15 text-warning border-warning/30" />
        <KpiCard icon={CheckCircle2} label="Importadas (hoje)" value={kpis.hoje} badge="Concluídas" badgeCls="bg-success/15 text-success border-success/30" />
      </div>

      {/* Caixa SEFAZ */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" /> Caixa SEFAZ (Focus NFe)
              </h2>
              <p className="text-sm text-muted-foreground">
                Notas (DF-e) capturadas automaticamente da SEFAZ via Focus NFe ou upload manual de notas e boletos.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/nf-arquivadas">Ver todas</Link>
              </Button>
              <Button size="sm" onClick={syncNow} disabled={syncing} className="gap-1">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar agora
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma nota pendente. Clique em <strong>Sincronizar agora</strong> para buscar novas DF-e.
            </p>
          ) : notes.map((n) => {
            const st = STATUS_LABELS[n.status] ?? STATUS_LABELS.awaiting_sefaz;
            const ready = n.status === "ready";
            return (
              <div key={n.id} className="rounded-lg border p-4 hover:bg-accent/30 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] uppercase">Série {n.serie ?? "—"}</Badge>
                      <button
                        onClick={() => setNoteOpen(n.id)}
                        className="font-semibold text-foreground hover:underline text-left"
                      >
                        {n.supplier_name ?? "Fornecedor —"}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">NF / Chave</p>
                    <p className="text-sm font-medium">{n.numero ?? "—"}</p>
                    <p className="font-mono text-[10px] text-muted-foreground break-all">{n.chave_acesso}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Emissão</p>
                    <p className="font-medium">{n.emission_date ? new Date(n.emission_date).toLocaleDateString("pt-BR") : "—"}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">recebida {new Date(n.received_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Valor total</p>
                    <p className="font-semibold">{fmtMoney(n.total_amount)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    {n.ciencia_at && <Badge variant="outline" className="text-[10px]">Ciência ✓</Badge>}
                    <span className="text-[10px] text-muted-foreground italic">origem: {n.origin}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  {ready ? (
                    <Button size="sm" onClick={() => setNoteOpen(n.id)} className="gap-1">
                      <FileUp className="h-3 w-3" /> Importar p/ Estoque Central
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Aguardando sincronização FOCUS/SEFAZ — tente novamente mais tarde.
                    </p>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => refuseQuick(n, "unknown")}>
                    Desconhecer
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => refuseQuick(n, "refuse")}>
                    <X className="h-3 w-3 mr-1" /> Recusar
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Upload manual colapsável */}
      <Accordion type="single" collapsible>
        <AccordionItem value="manual" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2 text-left">
              <Upload className="h-4 w-4 text-primary" />
              <div>
                <p className="font-semibold text-sm">Upload manual de XML, ZIP ou boletos</p>
                <p className="text-xs text-muted-foreground">Use quando a nota não chegou pela Caixa SEFAZ — clique para abrir o painel.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <InventoryReceivingPanel />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Botões topo (rendered fora do header) — gestor */}
      <DfeConfigDialog open={configOpen} onOpenChange={setConfigOpen} onSynced={load} />
      <DfeNoteDialog noteId={noteOpen} onClose={() => setNoteOpen(null)} onImported={() => { load(); loadKpis(); }} />

      {/* Floating helpers no header */}
      <FloatingHeaderActions onConfig={() => setConfigOpen(true)} />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, badge, badgeCls }: any) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <Badge variant="outline" className={`text-[10px] ${badgeCls}`}>{badge}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// Botões "NF arquivadas" e ⚙ são renderizados no header da página (InventoryReceiving.tsx).
function FloatingHeaderActions({ onConfig }: { onConfig: () => void }) {
  useEffect(() => {
    const handler = () => onConfig();
    window.addEventListener("dfe:open-config", handler);
    return () => window.removeEventListener("dfe:open-config", handler);
  }, [onConfig]);
  return null;
}
