import { Fragment, useEffect, useMemo, useState } from "react";
import { Headset, Search, Calendar, Ticket, MessageSquare, Trash2, CheckCircle2, Loader2, Download, ChevronDown, ChevronUp, LayoutDashboard, TrendingUp, Clock, Palette, Bot, Plug, Globe } from "lucide-react";
import { PersonalizePanel, AgentPanel, IntegrationsPanel } from "@/components/crm/ParmeSettingsPanels";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Reservation = {
  id: string;
  parme_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  reservation_date: string | null;
  reservation_time: string | null;
  party_size: number | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
  synced_at: string;
};

type Ticket = {
  id: string;
  parme_id: string;
  description: string | null;
  order_number: string | null;
  contact: string | null;
  status: string | null;
  created_at: string | null;
  synced_at: string;
};

type Conversation = {
  id: string;
  parme_id: string;
  session_id: string | null;
  message_count: number | null;
  last_message_at: string | null;
  extracted: any;
  extracted_at: string | null;
  client_meta: any;
  created_at: string | null;
  synced_at: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return d;
  }
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return d;
  }
}

function translateStatus(s?: string | null) {
  const map: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    open: "Aberto",
    closed: "Fechado",
    resolved: "Resolvido",
    waiting: "Aguardando",
    in_progress: "Em andamento",
  };
  if (!s) return "—";
  return map[s.toLowerCase()] ?? s;
}

export default function CRM() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<any[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);
  const [convMsgsLoading, setConvMsgsLoading] = useState(false);
  const [convMsgs, setConvMsgs] = useState<any[] | null>(null);
  const [convMsgsError, setConvMsgsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r, t, c] = await Promise.all([
        supabase
          .from("reservations")
          .select("*")
          .order("reservation_date", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from("support_tickets")
          .select("*")
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from("chat_conversations")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(500),
      ]);
      if (r.error) throw r.error;
      if (t.error) throw t.error;
      if (c.error) throw c.error;

      // Compat: o resto da UI ainda referencia parme_id/synced_at/extracted/etc.
      // Mapeamos aqui para evitar uma reescrita maior. As fontes de verdade agora
      // são as tabelas canônicas locais (reservations/support_tickets/chat_conversations).
      const mappedRes = (r.data ?? []).map((x: any) => ({
        ...x,
        parme_id: x.id,
        synced_at: x.created_at,
      }));
      const mappedTickets = (t.data ?? []).map((x: any) => ({
        ...x,
        parme_id: x.id,
        synced_at: x.created_at,
      }));
      const mappedConvs = (c.data ?? []).map((x: any) => ({
        ...x,
        parme_id: x.id,
        synced_at: x.created_at ?? x.last_message_at,
        extracted: x.extracted ?? {},
        extracted_at: x.extracted_at ?? x.last_message_at,
        client_meta: x.client_meta ?? {},
      }));

      setReservations(mappedRes as Reservation[]);
      setTickets(mappedTickets as Ticket[]);
      setConversations(mappedConvs as Conversation[]);
    } catch (e: any) {
      toast.error("Erro ao carregar dados", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Buscar thread bruto do Parmê ao expandir um ticket
  useEffect(() => {
    if (!expandedTicketId) {
      setThreadMessages(null);
      setThreadError(null);
      setThreadLoading(false);
      return;
    }
    const ticket = tickets.find((t) => t.id === expandedTicketId);
    if (!ticket) return;
    let cancelled = false;
    setThreadLoading(true);
    setThreadMessages(null);
    setThreadError(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const url = `https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/parme-get-ticket-conversation`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ ticket_id: ticket.parme_id }),
        });
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.error === "parme_endpoint_unavailable") {
          setThreadError("parme_endpoint_unavailable");
          return;
        }
        if (!resp.ok) {
          setThreadError(data?.message ?? `HTTP ${resp.status}`);
          return;
        }
        const msgs = data?.messages;
        setThreadMessages(Array.isArray(msgs) ? msgs : []);
      } catch (e: any) {
        if (!cancelled) setThreadError(e?.message ?? "fetch_error");
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedTicketId, tickets]);

  // Buscar mensagens da conversa ao expandir
  useEffect(() => {
    if (!expandedConvId) {
      setConvMsgs(null);
      setConvMsgsError(null);
      setConvMsgsLoading(false);
      return;
    }
    const conv = conversations.find((c) => c.id === expandedConvId);
    if (!conv) return;
    let cancelled = false;
    setConvMsgsLoading(true);
    setConvMsgs(null);
    setConvMsgsError(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const url = `https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/parme-get-conversation-messages`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            conversation_id: conv.parme_id,
            session_id: conv.session_id,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.error === "parme_endpoint_unavailable") {
          setConvMsgsError("parme_endpoint_unavailable");
          return;
        }
        if (!resp.ok) {
          setConvMsgsError(data?.message ?? `HTTP ${resp.status}`);
          return;
        }
        const msgs = data?.messages;
        setConvMsgs(Array.isArray(msgs) ? msgs : []);
      } catch (e: any) {
        if (!cancelled) setConvMsgsError(e?.message ?? "fetch_error");
      } finally {
        if (!cancelled) setConvMsgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedConvId, conversations]);

  async function handleDeleteReservation(parmeId: string) {
    setDeletingId(parmeId);
    const tid = toast.loading("Excluindo reserva no Parmê…");
    try {
      const { data: payload, error } = await supabase.functions.invoke(
        "parme-delete-reservation",
        { body: { parme_id: parmeId } },
      );

      if (payload?.error === "parme_endpoint_unavailable") {
        toast.warning("Parmê ainda não expõe DELETE público", {
          id: tid,
          description:
            "Peça ao time do Parmê para implementar DELETE /api/public/reservations/:id.",
          duration: 8000,
        });
        return;
      }
      if (error) {
        throw new Error((payload as any)?.message ?? error.message);
      }

      toast.success("Reserva excluída", {
        id: tid,
        description: "Removida no Parmê e sincronizada aqui.",
      });
      setReservations((prev) => prev.filter((r) => r.parme_id !== parmeId));
    } catch (e: any) {
      toast.error("Falha ao excluir", { id: tid, description: e.message });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirmReservation(parmeId: string) {
    setConfirmingId(parmeId);
    const tid = toast.loading("Confirmando reserva e enviando WhatsApp…");
    try {
      const { data: payload, error } = await supabase.functions.invoke(
        "parme-confirm-reservation",
        { body: { parme_id: parmeId } },
      );

      if ((payload as any)?.error === "parme_endpoint_unavailable") {
        toast.warning("Parmê ainda não expõe PATCH público", {
          id: tid,
          description:
            "Peça ao time do Parmê para implementar PATCH /api/public/reservations/:id.",
          duration: 8000,
        });
        return;
      }
      if (error) {
        throw new Error((payload as any)?.message ?? error.message);
      }

      setReservations((prev) =>
        prev.map((r) =>
          r.parme_id === parmeId ? { ...r, status: "confirmed" } : r,
        ),
      );

      if ((payload as any)?.whatsapp_sent) {
        toast.success("Reserva confirmada", {
          id: tid,
          description: "WhatsApp enviado ao cliente.",
        });
      } else {
        toast.warning("Reserva confirmada, mas WhatsApp falhou", {
          id: tid,
          description:
            (payload as any)?.whatsapp_error ?? "Sem detalhes do provedor.",
          duration: 8000,
        });
      }
    } catch (e: any) {
      toast.error("Falha ao confirmar", { id: tid, description: e.message });
    } finally {
      setConfirmingId(null);
    }
  }

  // brands (extraídos das conversas)
  const brands = useMemo(() => {
    const set = new Set<string>();
    conversations.forEach((c) => {
      const m = c.extracted?.marca;
      if (m && typeof m === "string") set.add(m);
    });
    return Array.from(set).sort();
  }, [conversations]);

  const q = search.trim().toLowerCase();

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (q) {
        const hit =
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [reservations, q]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (q) {
        const hit =
          (t.contact ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.order_number ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [tickets, q]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c: any) => {
      // Só conversas com pelo menos 2 entradas do usuário
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      const userCount = msgs.filter(
        (m: any) => (m?.role ?? m?.author ?? m?.from) === "user",
      ).length;
      if (msgs.length > 0) {
        if (userCount < 2) return false;
      } else {
        // fallback quando o array não está populado: aproxima 2 turnos do usuário ~= 4 msgs
        if ((c.message_count ?? 0) < 4) return false;
      }
      if (q) {
        const blob = JSON.stringify({
          m: c.client_meta,
          msgs,
        }).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, q]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Headset className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            CRM
          </h1>
          <p className="text-muted-foreground">
            Reservas, tickets e conversas extraídas pela Giana (Parmê).
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2 shrink-0">
          <a href="https://aquelaparme.com.br" target="_blank" rel="noopener noreferrer">
            <Globe className="h-4 w-4" />
            Ver site
          </a>
        </Button>
      </div>

      {/* Toolbar sticky: busca */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/85 backdrop-blur border-y">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, e-mail, pedido…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="w-full h-auto p-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-1 bg-muted">
          <TabsTrigger value="dashboard" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="reservations" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Calendar className="h-4 w-4" />
            <span>Reservas</span>
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-semibold tabular-nums">
              {filteredReservations.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Ticket className="h-4 w-4" />
            <span>Tickets</span>
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-semibold tabular-nums">
              {filteredTickets.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <MessageSquare className="h-4 w-4" />
            <span>Conversas</span>
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-semibold tabular-nums">
              {filteredConversations.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="personalize" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Palette className="h-4 w-4" />
            <span>Personalizar</span>
          </TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Bot className="h-4 w-4" />
            <span>Agente IA</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Plug className="h-4 w-4" />
            <span>Integrações</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="mt-4">
          <CRMDashboard
            reservations={filteredReservations}
            tickets={filteredTickets}
            conversations={filteredConversations}
          />
        </TabsContent>


        {/* Reservas */}
        <TabsContent value="reservations" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {/* Mobile: cards */}
              <div className="md:hidden divide-y">
                {loading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
                ) : filteredReservations.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma reserva.</div>
                ) : (
                  filteredReservations.map((r) => (
                    <div key={r.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.phone ?? "—"}</div>
                          {r.email && (
                            <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                          )}
                        </div>
                        {r.status && (
                          <Badge
                            variant={
                              r.status === "confirmed"
                                ? "default"
                                : r.status === "cancelled"
                                  ? "destructive"
                                  : "outline"
                            }
                            className={
                              r.status === "confirmed"
                                ? "bg-success text-success-foreground hover:bg-success/90 shrink-0"
                                : "shrink-0"
                            }
                          >
                            {translateStatus(r.status)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {fmtDate(r.reservation_date)} · {r.reservation_time?.slice(0, 5) ?? "—"}
                        </span>
                        <span>· {r.party_size ?? "?"} pess.</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {r.status !== "confirmed" && r.status !== "cancelled" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={confirmingId === r.parme_id}
                                className="border-success text-success hover:bg-success hover:text-success-foreground gap-1 flex-1"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Confirmar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar reserva?</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-2">
                                    <p>
                                      Vamos marcar a reserva de{" "}
                                      <strong>{r.name ?? "—"}</strong> como confirmada no Parmê
                                      e enviar este WhatsApp ao cliente
                                      {r.phone ? ` (${r.phone})` : ""}:
                                    </p>
                                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground">
{`Olá, ${(r.name || "").split(" ")[0] || "tudo bem"}! 👋

Sua reserva no *Aquela Parmê* está *confirmada* para *${fmtDate(r.reservation_date)}* às *${r.reservation_time?.slice(0, 5) ?? "—"}*${r.party_size ? ` para ${r.party_size} ${r.party_size === 1 ? "pessoa" : "pessoas"}` : ""}.

Qualquer alteração é só responder por aqui. Até logo! 🍝`}
                                    </pre>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleConfirmReservation(r.parme_id)}
                                  className="bg-success text-success-foreground hover:bg-success/90"
                                >
                                  Confirmar e enviar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingId === r.parme_id}
                              className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir reserva?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Isso vai excluir a reserva de <strong>{r.name ?? "—"}</strong>{" "}
                                também no Parmê. A ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteReservation(r.parme_id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Pessoas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredReservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma reserva.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReservations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="text-sm">{r.phone ?? "—"}</div>
                          {r.email && (
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          )}
                        </TableCell>
                        <TableCell>{fmtDate(r.reservation_date)}</TableCell>
                        <TableCell>{r.reservation_time?.slice(0, 5) ?? "—"}</TableCell>
                        <TableCell>{r.party_size ?? "—"}</TableCell>
                        <TableCell>
                          {r.status ? (
                            <Badge
                              variant={
                                r.status === "confirmed"
                                  ? "default"
                                  : r.status === "cancelled"
                                    ? "destructive"
                                    : "outline"
                              }
                              className={
                                r.status === "confirmed"
                                  ? "bg-success text-success-foreground hover:bg-success/90"
                                  : undefined
                              }
                            >
                              {translateStatus(r.status)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {r.status !== "confirmed" && r.status !== "cancelled" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={confirmingId === r.parme_id}
                                    className="border-success text-success hover:bg-success hover:text-success-foreground gap-1"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Confirmar
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar reserva?</AlertDialogTitle>
                                    <AlertDialogDescription asChild>
                                      <div className="space-y-2">
                                        <p>
                                          Vamos marcar a reserva de{" "}
                                          <strong>{r.name ?? "—"}</strong> como confirmada no Parmê
                                          e enviar este WhatsApp ao cliente
                                          {r.phone ? ` (${r.phone})` : ""}:
                                        </p>
                                        <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground">
{`Olá, ${(r.name || "").split(" ")[0] || "tudo bem"}! 👋

Sua reserva no *Aquela Parmê* está *confirmada* para *${fmtDate(r.reservation_date)}* às *${r.reservation_time?.slice(0, 5) ?? "—"}*${r.party_size ? ` para ${r.party_size} ${r.party_size === 1 ? "pessoa" : "pessoas"}` : ""}.

Qualquer alteração é só responder por aqui. Até logo! 🍝`}
                                        </pre>
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleConfirmReservation(r.parme_id)}
                                      className="bg-success text-success-foreground hover:bg-success/90"
                                    >
                                      Confirmar e enviar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={deletingId === r.parme_id}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Excluir reserva"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir reserva?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Isso vai excluir a reserva de <strong>{r.name ?? "—"}</strong>{" "}
                                    também no Parmê (sistema de origem). A ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteReservation(r.parme_id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tickets */}
        <TabsContent value="tickets" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum ticket.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTickets.map((t) => {
                      const isOpen = expandedTicketId === t.id;
                      const digits = (t.contact ?? "").replace(/\D+/g, "");
                      const related = digits
                        ? conversations.filter((c) => {
                            const candidates = [
                              c.extracted?.telefone,
                              c.extracted?.phone,
                              c.client_meta?.phone,
                              c.client_meta?.telefone,
                            ]
                              .filter(Boolean)
                              .map((v: any) => String(v).replace(/\D+/g, ""));
                            return candidates.some(
                              (x) => x === digits || x.endsWith(digits) || digits.endsWith(x),
                            );
                          })
                        : [];
                      return (
                        <Fragment key={t.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedTicketId(isOpen ? null : t.id)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {isOpen ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                                {t.order_number ?? "—"}
                              </div>
                            </TableCell>
                            <TableCell>{t.contact ?? "—"}</TableCell>
                            <TableCell className="max-w-md">
                              <div className="line-clamp-2 text-sm">{t.description ?? "—"}</div>
                            </TableCell>
                            <TableCell>
                              {t.status ? <Badge variant="outline">{translateStatus(t.status)}</Badge> : "—"}
                            </TableCell>
                            <TableCell>{fmtDateTime(t.created_at)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={5} className="p-0">
                                <div className="p-4 space-y-4 bg-muted/20 border-t">
                                  <div className="flex flex-wrap gap-2 text-sm">
                                    {t.status && (
                                      <Badge variant="outline">status: {translateStatus(t.status)}</Badge>
                                    )}
                                    <Badge variant="outline" className="font-mono">
                                      id: {t.parme_id.slice(0, 8)}
                                    </Badge>
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                                      Descrição
                                    </div>
                                    <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                                      {t.description ?? "—"}
                                    </div>
                                  </div>

                                  {/* Thread bruto do Parmê */}
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                                      <Download className="h-3.5 w-3.5" />
                                      Conversa completa (Parmê)
                                      {threadMessages && ` (${threadMessages.length})`}
                                    </div>
                                    {threadLoading ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Buscando mensagens no Parmê…
                                      </div>
                                    ) : threadError === "parme_endpoint_unavailable" ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                        O Parmê ainda não expõe{" "}
                                        <code className="font-mono text-xs">
                                          GET /api/public/tickets/:id/messages
                                        </code>
                                        . Peça ao time do Parmê para implementar este endpoint.
                                      </div>
                                    ) : threadError ? (
                                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                                        Falha ao buscar conversa: {threadError}
                                      </div>
                                    ) : threadMessages && threadMessages.length === 0 ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                        Nenhuma mensagem retornada para este ticket.
                                      </div>
                                    ) : threadMessages ? (
                                      <div className="space-y-2 max-h-80 overflow-y-auto rounded-md border p-3 bg-muted/20">
                                        {threadMessages.map((m: any, i: number) => {
                                          const role =
                                            m.role ?? m.author ?? m.from ?? "user";
                                          const isAssistant =
                                            role === "assistant" ||
                                            role === "ai" ||
                                            role === "bot";
                                          const content =
                                            typeof m.content === "string"
                                              ? m.content
                                              : (m.message ?? m.text ?? JSON.stringify(m.content ?? m));
                                          const ts = m.created_at ?? m.timestamp ?? m.time;
                                          return (
                                            <div
                                              key={m.id ?? i}
                                              className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                                            >
                                              <div
                                                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                                                  isAssistant
                                                    ? "bg-background border"
                                                    : "bg-primary text-primary-foreground"
                                                }`}
                                              >
                                                {content}
                                              </div>
                                              <div className="text-[10px] text-muted-foreground mt-0.5 px-1">
                                                {role}
                                                {ts ? ` · ${fmtDateTime(ts)}` : ""}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      Conversa(s) relacionada(s) {related.length > 0 && `(${related.length})`}
                                    </div>
                                    {related.length === 0 ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                        Nenhuma conversa do Parmê encontrada para este contato.
                                        {!t.contact && " O ticket não tem telefone associado."}
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        {related.map((c) => (
                                          <div key={c.id} className="rounded-md border p-3 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                              {c.extracted?.marca && (
                                                <Badge>{String(c.extracted.marca)}</Badge>
                                              )}
                                              <span className="font-mono">
                                                sessão: {c.session_id?.slice(0, 16) ?? "—"}
                                              </span>
                                              <span>· {c.message_count ?? 0} mensagens</span>
                                              <span>· {fmtDateTime(c.extracted_at)}</span>
                                            </div>
                                            {c.extracted && Object.keys(c.extracted).length > 0 && (
                                              <div className="rounded bg-muted/40 p-2 text-xs space-y-0.5">
                                                {Object.entries(c.extracted).map(([k, v]) => (
                                                  <div key={k}>
                                                    <span className="text-muted-foreground">{k}:</span>{" "}
                                                    <span className="font-mono">
                                                      {typeof v === "string" ? v : JSON.stringify(v)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {c.client_meta && Object.keys(c.client_meta).length > 0 && (
                                              <details className="text-xs">
                                                <summary className="cursor-pointer text-muted-foreground">
                                                  metadados do cliente
                                                </summary>
                                                <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
                                                  {JSON.stringify(c.client_meta, null, 2)}
                                                </pre>
                                              </details>
                                            )}
                                          </div>
                                        ))}
                                        <p className="text-xs text-muted-foreground">
                                          As mensagens individuais ficam no Parmê — aqui guardamos só o
                                          resumo extraído pela IA.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversas */}
        <TabsContent value="conversations" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Mensagens</TableHead>
                    <TableHead>Última mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredConversations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma conversa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredConversations.map((c: any) => {
                      const phone =
                        c.client_meta?.phone ??
                        c.client_meta?.telefone ??
                        c.client_meta?.name ??
                        "—";
                      const isOpen = expandedConvId === c.id;
                      return (
                        <Fragment key={c.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedConvId(isOpen ? null : c.id)}
                          >
                            <TableCell>
                              {isOpen ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{String(phone)}</TableCell>
                            <TableCell>{c.message_count ?? "—"}</TableCell>
                            <TableCell>{fmtDateTime(c.last_message_at)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={4} className="p-0">
                                <div className="p-4 space-y-4 bg-muted/20 border-t">
                                  <div className="flex flex-wrap gap-2 text-sm">
                                    <Badge variant="outline">
                                      {c.message_count ?? 0} mensagens
                                    </Badge>
                                    <Badge variant="outline">
                                      {fmtDateTime(c.last_message_at)}
                                    </Badge>
                                  </div>


                                  {/* Mensagens trocadas */}
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      Mensagens trocadas (Parmê)
                                      {convMsgs && ` (${convMsgs.length})`}
                                    </div>
                                    {convMsgsLoading ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Buscando mensagens no Parmê…
                                      </div>
                                    ) : convMsgsError === "parme_endpoint_unavailable" ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                        O Parmê ainda não expõe{" "}
                                        <code className="font-mono text-xs">
                                          GET /api/public/conversations/:id/messages
                                        </code>
                                        . Peça ao time do Parmê para implementar este endpoint.
                                      </div>
                                    ) : convMsgsError ? (
                                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                                        Falha ao buscar mensagens: {convMsgsError}
                                      </div>
                                    ) : convMsgs && convMsgs.length === 0 ? (
                                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                        Nenhuma mensagem retornada para esta conversa.
                                      </div>
                                    ) : convMsgs ? (
                                      <div className="space-y-2 max-h-96 overflow-y-auto rounded-md border p-3 bg-muted/20">
                                        {convMsgs.map((m: any, i: number) => {
                                          const role =
                                            m.role ?? m.author ?? m.from ?? "user";
                                          const isAssistant =
                                            role === "assistant" ||
                                            role === "ai" ||
                                            role === "bot";
                                          const content =
                                            typeof m.content === "string"
                                              ? m.content
                                              : (m.message ?? m.text ?? JSON.stringify(m.content ?? m));
                                          const ts = m.created_at ?? m.timestamp ?? m.time;
                                          return (
                                            <div
                                              key={m.id ?? i}
                                              className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                                            >
                                              <div
                                                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                                                  isAssistant
                                                    ? "bg-background border"
                                                    : "bg-primary text-primary-foreground"
                                                }`}
                                              >
                                                {content}
                                              </div>
                                              <div className="text-[10px] text-muted-foreground mt-0.5 px-1">
                                                {role}
                                                {ts ? ` · ${fmtDateTime(ts)}` : ""}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>

                                  {c.client_meta && Object.keys(c.client_meta).length > 0 && (
                                    <details className="text-xs">
                                      <summary className="cursor-pointer text-muted-foreground">
                                        metadados do cliente
                                      </summary>
                                      <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
                                        {JSON.stringify(c.client_meta, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personalize" className="mt-4">
          <PersonalizePanel />
        </TabsContent>

        <TabsContent value="agent" className="mt-4">
          <AgentPanel />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- CRM Dashboard ----------

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
];

function CRMDashboard({
  reservations,
  tickets,
  conversations,
}: {
  reservations: Reservation[];
  tickets: Ticket[];
  conversations: Conversation[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Status breakdown reservas
  const resByStatus = useMemo(() => {
    const m = new Map<string, number>();
    reservations.forEach((r) => {
      const k = (r.status ?? "—").toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([status, count]) => ({
      status: translateStatus(status),
      count,
    }));
  }, [reservations]);

  // Status breakdown tickets
  const ticketsByStatus = useMemo(() => {
    const m = new Map<string, number>();
    tickets.forEach((t) => {
      const k = (t.status ?? "—").toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([status, count]) => ({
      status: translateStatus(status),
      count,
    }));
  }, [tickets]);

  // Reservas próximas (a partir de hoje)
  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => {
        if (!r.reservation_date) return false;
        const d = new Date(r.reservation_date);
        d.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .sort((a, b) => (a.reservation_date! > b.reservation_date! ? 1 : -1))
      .slice(0, 6);
  }, [reservations]);

  // Reservas por dia (próximos 14 dias)
  const resPerDay = useMemo(() => {
    const buckets: { day: string; count: number; label: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({
        day: key,
        label: format(d, "dd/MM", { locale: ptBR }),
        count: 0,
      });
    }
    reservations.forEach((r) => {
      if (!r.reservation_date) return;
      const key = r.reservation_date.slice(0, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) b.count++;
    });
    return buckets;
  }, [reservations]);

  // Tickets criados últimos 14 dias
  const ticketsPerDay = useMemo(() => {
    const buckets: { day: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({
        day: key,
        label: format(d, "dd/MM", { locale: ptBR }),
        count: 0,
      });
    }
    tickets.forEach((t) => {
      if (!t.created_at) return;
      const key = t.created_at.slice(0, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) b.count++;
    });
    return buckets;
  }, [tickets]);

  // Conversas por marca
  const convByBrand = useMemo(() => {
    const m = new Map<string, number>();
    conversations.forEach((c) => {
      const marca = (c.extracted?.marca as string) ?? "Sem marca";
      m.set(marca, (m.get(marca) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [conversations]);

  const pendingRes = resByStatus.find((s) => s.status === "Pendente")?.count ?? 0;
  const openTickets = ticketsByStatus.find((s) => s.status === "Aberto")?.count ?? 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Reservas pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{pendingRes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximas reservas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcoming.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Ticket className="h-4 w-4" /> Tickets abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{openTickets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Conversas (total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversations.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reservas — próximos 14 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tickets — últimos 14 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status das reservas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {resByStatus.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(e) => `${e.status}: ${e.count}`}
                    >
                      {resByStatus.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversas por marca</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {convByBrand.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={convByBrand} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      width={110}
                    />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]}>
                      {convByBrand.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Próximas reservas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Próximas reservas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma reserva futura.
            </div>
          ) : (
            <div className="divide-y">
              {upcoming.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3"
                >
                  <div>
                    <div className="font-medium">{r.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.phone ?? "—"} · {r.party_size ?? "?"} pessoas
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      {fmtDate(r.reservation_date)}{" "}
                      <span className="text-muted-foreground">
                        {r.reservation_time?.slice(0, 5) ?? ""}
                      </span>
                    </div>
                    <Badge
                      variant={
                        r.status === "confirmed"
                          ? "default"
                          : r.status === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                      className={
                        r.status === "confirmed"
                          ? "bg-success text-success-foreground hover:bg-success/90"
                          : undefined
                      }
                    >
                      {translateStatus(r.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

