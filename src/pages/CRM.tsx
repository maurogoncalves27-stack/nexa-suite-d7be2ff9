import { useEffect, useMemo, useState } from "react";
import { Headset, RefreshCw, Search, Calendar, Ticket, MessageSquare, Trash2, CheckCircle2, Loader2, Download } from "lucide-react";
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

export default function CRM() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<any[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [lastSync, setLastSync] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, t, c] = await Promise.all([
        supabase
          .from("parme_reservations")
          .select("*")
          .order("reservation_date", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from("parme_tickets")
          .select("*")
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from("parme_conversations")
          .select("*")
          .order("extracted_at", { ascending: false, nullsFirst: false })
          .limit(500),
      ]);
      if (r.error) throw r.error;
      if (t.error) throw t.error;
      if (c.error) throw c.error;
      setReservations((r.data as Reservation[]) ?? []);
      setTickets((t.data as Ticket[]) ?? []);
      setConversations((c.data as Conversation[]) ?? []);

      const allSyncs = [
        ...(r.data ?? []).map((x: any) => x.synced_at),
        ...(t.data ?? []).map((x: any) => x.synced_at),
        ...(c.data ?? []).map((x: any) => x.synced_at),
      ].filter(Boolean);
      if (allSyncs.length) {
        const max = allSyncs.reduce((a, b) => (a > b ? a : b));
        setLastSync(max);
      } else {
        setLastSync(null);
      }
    } catch (e: any) {
      toast.error("Erro ao carregar dados", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Buscar thread bruto do Parmê ao abrir um ticket
  useEffect(() => {
    if (!openTicket) {
      setThreadMessages(null);
      setThreadError(null);
      setThreadLoading(false);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setThreadMessages(null);
    setThreadError(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "parme-get-ticket-conversation",
          { body: { ticket_id: openTicket.parme_id } },
        );
        if (cancelled) return;
        if ((data as any)?.error === "parme_endpoint_unavailable") {
          setThreadError("parme_endpoint_unavailable");
          return;
        }
        if (error) {
          setThreadError((data as any)?.message ?? error.message);
          return;
        }
        const msgs = (data as any)?.messages;
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
  }, [openTicket]);

  async function handleSync() {
    setSyncing(true);
    const tid = toast.loading("Sincronizando histórico do Parmê…");
    try {
      // Não usar supabase.functions.invoke para conseguir ler o status 503
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/parme-backfill`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: "{}",
      });
      const payload = await resp.json().catch(() => ({}));

      if (resp.status === 503 || payload?.error === "parme_endpoint_unavailable") {
        toast.warning("Parmê ainda não expõe o export público", {
          id: tid,
          description:
            "Peça ao time do Parmê para implementar GET /api/public/export/{reservations,tickets,conversations}. O webhook já está funcionando para eventos novos.",
          duration: 8000,
        });
        return;
      }
      if (!resp.ok) {
        throw new Error(payload?.message ?? `HTTP ${resp.status}`);
      }

      const counts = payload?.counts ?? {};
      toast.success("Sincronização concluída", {
        id: tid,
        description: `Reservas: ${counts.reservations ?? 0} · Tickets: ${counts.tickets ?? 0} · Conversas: ${counts.conversations ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast.error("Falha ao sincronizar", { id: tid, description: e.message });
    } finally {
      setSyncing(false);
    }
  }

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
    return conversations.filter((c) => {
      if (brand !== "all" && c.extracted?.marca !== brand) return false;
      if (q) {
        const blob = JSON.stringify({
          s: c.session_id,
          e: c.extracted,
          m: c.client_meta,
        }).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, brand, q]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Headset className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            CRM
          </h1>
          <p className="text-muted-foreground">
            Reservas, tickets e conversas extraídas pela Giana (Parmê).
          </p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-1">
              Última sincronização:{" "}
              {formatDistanceToNow(new Date(lastSync), {
                addSuffix: true,
                locale: ptBR,
              })}{" "}
              ({fmtDateTime(lastSync)})
            </p>
          )}
        </div>
        <Button onClick={handleSync} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          Sincronizar histórico
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Reservas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reservations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ticket className="h-4 w-4" /> Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Conversas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversations.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, e-mail, pedido…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="md:w-56">
              <SelectValue placeholder="Marca (conversas)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as marcas</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="reservations" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reservations">
            Reservas ({filteredReservations.length})
          </TabsTrigger>
          <TabsTrigger value="tickets">
            Tickets ({filteredTickets.length})
          </TabsTrigger>
          <TabsTrigger value="conversations">
            Conversas ({filteredConversations.length})
          </TabsTrigger>
        </TabsList>

        {/* Reservas */}
        <TabsContent value="reservations" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
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
                              {r.status}
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
                                    variant="ghost"
                                    size="icon"
                                    disabled={confirmingId === r.parme_id}
                                    className="h-8 w-8 text-success hover:text-success"
                                    title="Confirmar reserva"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
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
                    filteredTickets.map((t) => (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setOpenTicket(t)}
                      >
                        <TableCell className="font-medium">{t.order_number ?? "—"}</TableCell>
                        <TableCell>{t.contact ?? "—"}</TableCell>
                        <TableCell className="max-w-md">
                          <div className="line-clamp-2 text-sm">{t.description ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          {t.status ? <Badge variant="outline">{t.status}</Badge> : "—"}
                        </TableCell>
                        <TableCell>{fmtDateTime(t.created_at)}</TableCell>
                      </TableRow>
                    ))
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
                    <TableHead>Marca</TableHead>
                    <TableHead>Sessão</TableHead>
                    <TableHead>Mensagens</TableHead>
                    <TableHead>Resumo extraído</TableHead>
                    <TableHead>Extraído em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredConversations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma conversa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredConversations.map((c) => {
                      const marca = c.extracted?.marca ?? "—";
                      const intent = c.extracted?.intent ?? c.extracted?.intencao;
                      const phone = c.extracted?.telefone ?? c.client_meta?.phone;
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            {marca !== "—" ? <Badge>{marca}</Badge> : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.session_id?.slice(0, 12) ?? "—"}
                          </TableCell>
                          <TableCell>{c.message_count ?? "—"}</TableCell>
                          <TableCell className="max-w-md">
                            <div className="text-sm space-y-0.5">
                              {intent && (
                                <div>
                                  <span className="text-muted-foreground">intent:</span>{" "}
                                  {String(intent)}
                                </div>
                              )}
                              {phone && (
                                <div>
                                  <span className="text-muted-foreground">tel:</span>{" "}
                                  {String(phone)}
                                </div>
                              )}
                              {!intent && !phone && (
                                <div className="text-muted-foreground line-clamp-2 font-mono text-xs">
                                  {JSON.stringify(c.extracted ?? {}).slice(0, 160)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{fmtDateTime(c.extracted_at)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalhes do ticket */}
      <Dialog open={!!openTicket} onOpenChange={(o) => !o && setOpenTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {openTicket && (() => {
            const digits = (openTicket.contact ?? "").replace(/\D+/g, "");
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
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-primary" />
                    Ticket {openTicket.order_number ? `#${openTicket.order_number}` : ""}
                  </DialogTitle>
                  <DialogDescription>
                    Criado {fmtDateTime(openTicket.created_at)}
                    {openTicket.contact ? ` · ${openTicket.contact}` : ""}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    {openTicket.status && (
                      <Badge variant="outline">status: {openTicket.status}</Badge>
                    )}
                    <Badge variant="outline" className="font-mono">
                      id: {openTicket.parme_id.slice(0, 8)}
                    </Badge>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Descrição
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                      {openTicket.description ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Conversa(s) relacionada(s) {related.length > 0 && `(${related.length})`}
                    </div>
                    {related.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        Nenhuma conversa do Parmê encontrada para este contato.
                        {!openTicket.contact && " O ticket não tem telefone associado."}
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
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
