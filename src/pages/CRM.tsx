import { useEffect, useMemo, useState } from "react";
import { Headset, RefreshCw, Search, Calendar, Ticket, MessageSquare } from "lucide-react";
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredReservations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                          {r.status ? <Badge variant="outline">{r.status}</Badge> : "—"}
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
                      <TableRow key={t.id}>
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
    </div>
  );
}
