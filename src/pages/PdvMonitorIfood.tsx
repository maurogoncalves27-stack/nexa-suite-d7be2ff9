import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Ev = {
  id: string;
  order_id: string;
  source: string | null;
  event_code: string | null;
  previous_status: string | null;
  new_status: string | null;
  payload: unknown;
  acknowledged?: boolean | null;
  created_at: string;
};

type Failed = {
  id: string;
  external_event_id: string | null;
  event_code: string | null;
  order_id_external: string | null;
  merchant_id: string | null;
  payload: unknown;
  error: string | null;
  attempts: number | null;
  source: string | null;
  resolved_at: string | null;
  created_at: string;
};

// Descrição amigável dos códigos do iFood
const CODE_LABEL: Record<string, string> = {
  PLC: "Pedido criado",
  CFM: "Confirmado",
  PRS: "Em preparo",
  RPR: "Em preparo (retomado)",
  RTP: "Pronto para retirada",
  PUP: "Coletado",
  DSP: "Despachado",
  CON: "Concluído",
  CAN: "Cancelado",
  CCA: "Cancelado (consumidor)",
  CANR: "Solicitação de cancelamento",
  DDCR: "PIN de entrega solicitado",
  ASGND: "Entregador designado",
  REA: "Entregador a caminho",
  ARR: "Entregador chegou",
};

export default function PdvMonitorIfood() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [codeFilter, setCodeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [evRes, fRes] = await Promise.all([
      supabase
        .from("pdv_order_events")
        .select("id,order_id,source,event_code,previous_status,new_status,payload,acknowledged,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("pdv_ifood_failed_events")
        .select("id,external_event_id,event_code,order_id_external,merchant_id,payload,error,attempts,source,resolved_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setEvents((evRes.data ?? []) as Ev[]);
    setFailed((fRes.data ?? []) as Failed[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("pdv_monitor_ifood")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pdv_order_events" },
        (payload) => setEvents((prev) => [payload.new as Ev, ...prev].slice(0, 200)),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pdv_ifood_failed_events" },
        (payload) => setFailed((prev) => [payload.new as Failed, ...prev].slice(0, 100)),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const codes = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => e.event_code && set.add(e.event_code));
    return Array.from(set).sort();
  }, [events]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => e.source && set.add(e.source));
    return Array.from(set).sort();
  }, [events]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((e) => {
      if (!e.event_code) return;
      map[e.event_code] = (map[e.event_code] ?? 0) + 1;
    });
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (codeFilter !== "all" && e.event_code !== codeFilter) return false;
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (!q) return true;
      const blob = `${e.event_code ?? ""} ${e.source ?? ""} ${e.order_id} ${JSON.stringify(e.payload ?? {})}`.toLowerCase();
      return blob.includes(q);
    });
  }, [events, search, codeFilter, sourceFilter]);

  const unresolvedFailed = failed.filter((f) => !f.resolved_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Monitor iFood
          </h1>
          <p className="text-muted-foreground">
            Log em tempo real de eventos recebidos do iFood e ações disparadas pelo PDV. Útil para acompanhar a homologação.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2 self-start">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </Button>
      </div>

      {/* Contadores por código */}
      {codes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Eventos por código (últimos {events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {codes.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCodeFilter(codeFilter === c ? "all" : c)}
                  className={`rounded-md border px-2 py-1 text-xs transition ${
                    codeFilter === c ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <strong className="font-mono">{c}</strong>
                  <span className="ml-1.5 text-muted-foreground">×{counts[c]}</span>
                  {CODE_LABEL[c] && <span className="ml-1.5 text-muted-foreground hidden sm:inline">· {CODE_LABEL[c]}</span>}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="processed">
        <TabsList>
          <TabsTrigger value="processed" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Processados ({events.length})
          </TabsTrigger>
          <TabsTrigger value="failed" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Falhados {unresolvedFailed > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px]">{unresolvedFailed}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="processed" className="mt-4 space-y-3">
          {/* Filtros */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, payload, order id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={codeFilter} onValueChange={setCodeFilter}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Código" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos códigos</SelectItem>
                {codes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Eventos ({filteredEvents.length})</CardTitle>
              <CardDescription className="text-xs">Atualiza automaticamente. Clique para ver o payload completo.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh]">
                {filteredEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Nenhum evento.</p>
                ) : (
                  <ul className="divide-y">
                    {filteredEvents.map((e) => {
                      const isOpen = expanded.has(e.id);
                      return (
                        <li key={e.id} className="hover:bg-muted/30">
                          <button
                            type="button"
                            onClick={() => toggle(e.id)}
                            className="w-full text-left px-4 py-3"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <Badge variant="outline" className="text-[10px] uppercase">{e.source ?? "—"}</Badge>
                              <span className="text-sm font-mono font-semibold">{e.event_code ?? "—"}</span>
                              {e.event_code && CODE_LABEL[e.event_code] && (
                                <span className="text-xs text-muted-foreground hidden sm:inline">{CODE_LABEL[e.event_code]}</span>
                              )}
                              {e.previous_status && e.new_status && (
                                <span className="text-xs text-muted-foreground">
                                  {e.previous_status} → <strong className="text-foreground">{e.new_status}</strong>
                                </span>
                              )}
                              {e.acknowledged && (
                                <Badge variant="secondary" className="text-[10px]">ACK</Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(e.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            {!isOpen && (
                              <p className="text-[11px] font-mono text-muted-foreground mt-1 truncate pl-5">
                                order {e.order_id.slice(0, 8)} · {e.payload ? JSON.stringify(e.payload).slice(0, 160) : "{}"}
                              </p>
                            )}
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-3 pl-9">
                              <p className="text-[11px] text-muted-foreground mb-1">order_id: <span className="font-mono">{e.order_id}</span></p>
                              <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(e.payload ?? {}, null, 2)}
                              </pre>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Eventos não processados ({failed.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Eventos do iFood que falharam ao serem processados (não receberam ACK). Serão retentados pelo polling.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh]">
                {failed.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Nenhuma falha registrada. 🎉</p>
                ) : (
                  <ul className="divide-y">
                    {failed.map((f) => {
                      const key = `f-${f.id}`;
                      const isOpen = expanded.has(key);
                      return (
                        <li key={f.id} className="hover:bg-muted/30">
                          <button type="button" onClick={() => toggle(key)} className="w-full text-left px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <Badge variant={f.resolved_at ? "secondary" : "destructive"} className="text-[10px]">
                                {f.resolved_at ? "resolvido" : "pendente"}
                              </Badge>
                              <span className="text-sm font-mono font-semibold">{f.event_code ?? "—"}</span>
                              <Badge variant="outline" className="text-[10px]">tentativas: {f.attempts ?? 0}</Badge>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(f.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="text-[11px] text-destructive mt-1 pl-5 truncate" title={f.error ?? ""}>
                              {f.error ?? "(sem mensagem)"}
                            </p>
                            {!isOpen && (
                              <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate pl-5">
                                {f.order_id_external ?? "—"} · merchant {f.merchant_id?.slice(0, 8) ?? "—"}
                              </p>
                            )}
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-3 pl-9 space-y-2">
                              <p className="text-[11px] text-muted-foreground">
                                external_event_id: <span className="font-mono">{f.external_event_id}</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                order externo: <span className="font-mono">{f.order_id_external}</span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                merchant: <span className="font-mono">{f.merchant_id}</span>
                              </p>
                              <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(f.payload ?? {}, null, 2)}
                              </pre>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
