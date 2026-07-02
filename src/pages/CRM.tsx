import { Fragment, useEffect, useMemo, useState } from "react";
import { Headset, Search, Calendar, Ticket, MessageSquare, Trash2, CheckCircle2, Loader2, Download, ChevronDown, ChevronUp, Clock, Bot, Globe, Star, ArrowRight, Settings, AlertCircle, CheckCircle, Users } from "lucide-react";
import { AgentPanel } from "@/components/crm/ParmeSettingsPanels";
import { ReservationSettingsDialog } from "@/components/crm/ReservationSettingsDialog";
import CustomerReviews from "@/pages/CustomerReviews";

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
  title: string | null;
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
  messages?: any[];
  message_count: number | null;
  last_message_at: string | null;
  extracted: any;
  extracted_at: string | null;
  client_meta: any;
  created_at: string | null;
  synced_at: string;
  source?: "chat" | "ticket";
  related_ticket?: Ticket;
  related_tickets?: Ticket[];
};

const NON_CLIENT_ROLES = new Set(["assistant", "ai", "bot", "system", "model", "tool"]);

function messageText(m: any) {
  if (Array.isArray(m?.parts)) {
    const text = m.parts
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p?.text ?? "")
      .join("");
    if (text.trim()) return text;
  }
  return String(typeof m?.content === "string" ? m.content : (m?.message ?? m?.text ?? ""));
}

function isAssistantMessage(m: any) {
  const role = String(m?.role ?? m?.author ?? m?.from ?? "user").toLowerCase();
  return NON_CLIENT_ROLES.has(role);
}

function isClientMessage(m: any) {
  const role = String(m?.role ?? m?.author ?? m?.from ?? "user").toLowerCase();
  return !NON_CLIENT_ROLES.has(role) && messageText(m).trim().length > 0;
}

function onlyDigits(v?: string | null) {
  return String(v ?? "").replace(/\D+/g, "");
}

function hasValidContact(v?: string | null) {
  return onlyDigits(v).length >= 8;
}

function ticketSessionId(t: Ticket) {
  return t.description?.match(/Conversa\s+([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

function ticketMessages(t: Ticket) {
  const lines = String(t.description ?? "")
    .replace(/^Conversa\s+[A-Za-z0-9_-]+:\s*/i, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const base = lines.length > 0 ? lines : [t.description ?? "Ticket registrado sem transcrição."];
  return base.map((content, index) => ({
    id: `${t.id}:${index}`,
    role: "user",
    content,
    ts: t.created_at,
  }));
}

function conversationPhones(c: Conversation): Set<string> {
  const phones = new Set<string>();
  const meta = (c.client_meta ?? {}) as Record<string, unknown>;
  for (const k of ["phone", "telefone", "whatsapp", "contact"]) {
    const v = onlyDigits(String(meta[k] ?? ""));
    if (v.length >= 8) phones.add(v);
  }
  const ex = (c.extracted ?? {}) as Record<string, unknown>;
  for (const k of ["phone", "telefone", "whatsapp", "contact"]) {
    const v = onlyDigits(String(ex[k] ?? ""));
    if (v.length >= 8) phones.add(v);
  }
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  for (const m of msgs) {
    const text = messageText(m);
    const matches = text.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/g) ?? [];
    for (const raw of matches) {
      const digits = onlyDigits(raw);
      if (digits.length >= 10) phones.add(digits);
    }
  }
  return phones;
}

function ticketMatchesConversation(t: Ticket, c: Conversation) {
  const session = ticketSessionId(t);
  if (session && c.session_id === session) return true;
  // Sem session_id explícito, casamos por telefone + proximidade temporal (±2h).
  const ticketPhone = onlyDigits(t.contact);
  if (ticketPhone.length < 8) return false;
  if (!conversationPhones(c).has(ticketPhone)) return false;
  const tTime = new Date(t.created_at ?? 0).getTime();
  const cTime = new Date(c.last_message_at ?? c.created_at ?? 0).getTime();
  if (!tTime || !cTime) return false;
  return Math.abs(tTime - cTime) <= 2 * 60 * 60 * 1000;
}

// Conversa "irrelevante": cliente só mandou saudação/uma palavra e não gerou ticket.
const TRIVIAL_TOKENS = new Set([
  "oi", "ola", "olá", "hey", "hello", "hi", "bom", "boa", "dia", "tarde", "noite",
  "ok", "blz", "beleza", "obg", "obrigado", "obrigada", "vlw", "valeu", "tchau",
  "sim", "nao", "não", "?", "!", ".", "",
]);
function isRelevantConversation(c: Conversation) {
  const anyC = c as { related_tickets?: unknown[]; related_ticket?: unknown };
  if (anyC.related_tickets?.length || anyC.related_ticket) return true;
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const clientMsgs = msgs.filter((m) => isClientMessage(m)).map((m) => messageText(m).trim());
  // Mantém TODAS as conversas que tiveram pelo menos uma entrada do cliente.
  // (antes filtrávamos saudações soltas, mas isso escondia conversas reais)
  return clientMsgs.length >= 1;
}




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

// Heurística: extrai informações do cliente a partir de client_meta + mensagens da conversa,
// inferindo dados que ele não disse explicitamente (telefone digitado, loja mencionada, canal, etc).
function extractClientInfo(conv: any, msgs: any[] | null): Record<string, string> {
  const info: Record<string, string> = {};
  const meta = conv?.client_meta ?? {};
  const ext = conv?.extracted ?? {};
  const pick = (k: string) => meta?.[k] ?? ext?.[k];

  if (pick("name") || pick("nome")) info["Nome"] = String(pick("name") ?? pick("nome"));
  if (pick("phone") || pick("telefone")) info["Telefone"] = String(pick("phone") ?? pick("telefone"));
  if (pick("email")) info["E-mail"] = String(pick("email"));
  if (pick("address") || pick("endereco")) info["Endereço"] = String(pick("address") ?? pick("endereco"));

  const userText = (msgs ?? [])
    .filter(isClientMessage)
    .map(messageText)
    .join("\n");

  if (!userText) {
    if (conv?.session_id) info["Sessão"] = String(conv.session_id);
    return info;
  }

  // Nome — frases comuns + tokens soltos após a IA perguntar o nome
  if (!info["Nome"]) {
    const stop = new Set([
      "que","de","do","da","para","pra","com","por","um","uma","o","a","os","as",
      "aqui","cliente","gerente","atendente","sim","nao","não","ok","oi","olá","ola",
      "bom","dia","tarde","noite","ola!","obrigado","obrigada","blz","beleza",
      "pedido","pedi","quero","comprar","ifood","whatsapp","asa","sul","norte",
      "lago","aguas","águas","claras","fabrica","fábrica","parme","parmê","box","caipira",
      "estrogonofe","retirada","delivery","entrega","mesa","reserva","cardapio","cardápio",
    ]);
    const isNameToken = (t: string) =>
      /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'.-]*$/.test(t) && !stop.has(t.toLowerCase()) && !/^\d/.test(t);
    const cap = (s: string) =>
      s.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
    const nameAtom = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'.-]*";

    const patterns = [
      new RegExp(`\\bmeu\\s+nome\\s+(?:é|eh|e)\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
      new RegExp(`\\bme\\s+chamo\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
      new RegExp(`\\baqui\\s+(?:é|eh|e|quem\\s+fala\\s+é)\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
      new RegExp(`\\bsou\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
    ];
    for (const re of patterns) {
      const m = userText.match(re);
      if (m) {
        const tokens = m[1].trim().split(/\s+/).filter(isNameToken);
        const name = tokens.slice(0, 3).join(" ").trim();
        if (name.length >= 2) {
          info["Nome (inferido)"] = cap(name);
          break;
        }
      }
    }

    // Fallback 1: a IA perguntou o nome → próxima resposta do cliente
    if (!info["Nome (inferido)"]) {
      const nameAsk = /\b(?:qual\s+(?:é|eh|e)?\s*(?:o\s+)?seu\s+nome|como\s+(?:posso\s+)?(?:te\s+)?chamar|seu\s+nome\??|me\s+(?:diz|fala)\s+seu\s+nome)\b/i;
      for (let i = 0; i < (msgs?.length ?? 0) - 1; i++) {
        const cur = msgs![i];
        const next = msgs![i + 1];
        if (!isAssistantMessage(cur) || !isClientMessage(next)) continue;
        const curText = messageText(cur);
        if (!nameAsk.test(curText)) continue;
        const reply = messageText(next);
        const tok = reply.split(/[\s,.!?]+/).filter(isNameToken);
        if (tok.length >= 1) {
          info["Nome (inferido)"] = cap(tok.slice(0, 3).join(" "));
          break;
        }
      }
    }

    // Fallback 2 removido: pegar token solto de qualquer mensagem produzia "nomes"
    // falsos como "Veio", "Informou", "Pedi". Só inferimos nome via padrões explícitos
    // ("meu nome é…", "me chamo…") ou quando a IA pergunta o nome.

  }
  // Telefone
  if (!info["Telefone"]) {
    const m = userText.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/);
    if (m) info["Telefone (inferido)"] = m[0].trim();
  }
  // E-mail
  if (!info["E-mail"]) {
    const m = userText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (m) info["E-mail (inferido)"] = m[0];
  }
  // Endereço
  const endMatch = userText.match(/\b(?:rua|av\.?|avenida|qd\.?|quadra|sqn|sqs|sqsw|qnp|cln|cls|conjunto)\s+[^\n,.;]{3,80}/i);
  if (endMatch) info["Endereço mencionado"] = endMatch[0].trim();

  // Loja mencionada
  const lojas = ["Asa Norte", "Asa Sul", "Águas Claras", "Aguas Claras", "Lago Sul"];
  const lojaHit = lojas.find((l) => new RegExp(l, "i").test(userText));
  if (lojaHit) info["Loja mencionada"] = lojaHit;

  // Canal preferido
  if (/\bretira(?:r|da)\b/i.test(userText)) info["Interesse"] = "Retirada";
  else if (/\bdelivery|entrega\b/i.test(userText)) info["Interesse"] = "Delivery";
  else if (/\bsal(?:ã|a)o|reserva|mesa\b/i.test(userText)) info["Interesse"] = "Salão / Reserva";

  // Pedido referenciado
  const pedido = userText.match(/(?:pedido\s*#?\s*|#)(\d{3,})/i);
  if (pedido) info["Pedido referenciado"] = `#${pedido[1]}`;

  // Sentimento (super simples)
  if (/\b(reclama|reclamação|ruim|p[eé]ssimo|horr[ií]vel|frio|errado|atrasou|demorou)\b/i.test(userText))
    info["Tom"] = "Reclamação";
  else if (/\b(parab[eé]ns|ador(?:o|ei)|excelente|maravilh|elogio|gostei)\b/i.test(userText))
    info["Tom"] = "Elogio";

  // Quantidade de mensagens do cliente
  const userMsgsCount = (msgs ?? []).filter((m: any) => {
    return isClientMessage(m);
  }).length;
  if (userMsgsCount) info["Mensagens do cliente"] = String(userMsgsCount);

  if (conv?.session_id) info["Sessão"] = String(conv.session_id);
  return info;
}

function pickClientName(c: any): string {
  const direct =
    c?.client_meta?.name ??
    c?.client_meta?.nome ??
    c?.extracted?.name ??
    c?.extracted?.nome;
  if (direct) return String(direct);
  // fallback: tenta inferir a partir das mensagens já gravadas no banco
  const msgs = Array.isArray(c?.messages) ? c.messages : null;
  if (msgs && msgs.length) {
    const info = extractClientInfo(c, msgs);
    if (info["Nome"] || info["Nome (inferido)"]) {
      return info["Nome"] ?? info["Nome (inferido)"];
    }
  }
  return "—";
}

export default function CRM() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketBusyId, setTicketBusyId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<any[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [reservationSettingsOpen, setReservationSettingsOpen] = useState(false);
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);
  const [convMsgsLoading, setConvMsgsLoading] = useState(false);
  const [convMsgs, setConvMsgs] = useState<any[] | null>(null);
  const [convMsgsError, setConvMsgsError] = useState<string | null>(null);
  const [showClientInfo, setShowClientInfo] = useState(false);
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
      const baseConvs = (c.data ?? []).map((x: any) => ({
        ...x,
        parme_id: x.id,
        synced_at: x.created_at ?? x.last_message_at,
        extracted: x.extracted ?? {},
        extracted_at: x.extracted_at ?? x.last_message_at,
        client_meta: x.client_meta ?? {},
        source: "chat" as const,
      })) as Conversation[];
      const rawTickets = (t.data ?? []).map((x: any) => ({
        ...x,
        parme_id: x.id,
        synced_at: x.created_at,
      })) as Ticket[];
      const mappedTickets = rawTickets.filter((x) => hasValidContact(x.contact));
      const ticketsByConversation = new Map<string, Ticket[]>();
      for (const ticket of mappedTickets) {
        const match = baseConvs.find((conv) => ticketMatchesConversation(ticket, conv));
        if (match) ticketsByConversation.set(match.id, [...(ticketsByConversation.get(match.id) ?? []), ticket]);
      }
      const ticketOnlyConvs = mappedTickets
        .filter((ticket) => !baseConvs.some((conv) => ticketMatchesConversation(ticket, conv)))
        .map((ticket) => ({
          id: `ticket-${ticket.id}`,
          parme_id: ticket.id,
          session_id: ticketSessionId(ticket) ?? `ticket-${ticket.id.slice(0, 8)}`,
          messages: ticketMessages(ticket),
          message_count: ticketMessages(ticket).length,
          last_message_at: ticket.created_at,
          extracted: {},
          extracted_at: ticket.created_at,
          client_meta: { phone: ticket.contact },
          created_at: ticket.created_at,
          synced_at: ticket.created_at ?? "",
          source: "ticket" as const,
          related_ticket: ticket,
          related_tickets: [ticket],
        })) as Conversation[];
      const contactlessTicketConvs = rawTickets
        .filter((ticket) => !hasValidContact(ticket.contact))
        .filter((ticket) => !baseConvs.some((conv) => ticketMatchesConversation(ticket, conv)))
        .map((ticket) => ({
          id: `ticket-conversation-${ticket.id}`,
          parme_id: ticket.id,
          session_id: ticketSessionId(ticket) ?? `ticket-${ticket.id.slice(0, 8)}`,
          messages: ticketMessages(ticket),
          message_count: ticketMessages(ticket).length,
          last_message_at: ticket.created_at,
          extracted: {},
          extracted_at: ticket.created_at,
          client_meta: {},
          created_at: ticket.created_at,
          synced_at: ticket.created_at ?? "",
          source: "chat" as const,
        })) as Conversation[];
      const mappedConvs = [
        ...baseConvs.map((conv) => ({
          ...conv,
          related_tickets: ticketsByConversation.get(conv.id) ?? [],
        })),
        ...ticketOnlyConvs,
        ...contactlessTicketConvs,
      ]
        .filter((c) => isRelevantConversation(c))
        .sort((a, b) => new Date(b.last_message_at ?? b.created_at ?? 0).getTime() - new Date(a.last_message_at ?? a.created_at ?? 0).getTime());


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

  // Mensagens do ticket: agora vêm do conversation match local (sem fetch externo).
  useEffect(() => {
    if (!expandedTicketId) {
      setThreadMessages(null);
      setThreadError(null);
      setThreadLoading(false);
      return;
    }
    const ticket = tickets.find((t) => t.id === expandedTicketId);
    if (!ticket) return;
    setThreadLoading(false);
    setThreadError(null);
    const digits = (ticket.contact ?? "").replace(/\D+/g, "");
    const order = (ticket.order_number ?? "").trim();
    const matched = conversations.find((c: any) => {
      const blob = JSON.stringify(c.messages ?? []);
      const blobDigits = blob.replace(/\D/g, "");
      if (digits.length >= 8 && blobDigits.includes(digits.slice(-8))) return true;
      if (order && blob.includes(order)) return true;
      return false;
    });
    const msgs = (matched as any)?.messages;
    setThreadMessages(Array.isArray(msgs) ? msgs : []);
  }, [expandedTicketId, tickets, conversations]);

  // Mensagens da conversa: leitura local direto de chat_conversations.messages.
  useEffect(() => {
    if (!expandedConvId) {
      setConvMsgs(null);
      setConvMsgsError(null);
      setConvMsgsLoading(false);
      return;
    }
    const conv = conversations.find((c) => c.id === expandedConvId);
    if (!conv) return;
    setConvMsgsLoading(false);
    setConvMsgsError(null);
    const msgs = (conv as any).messages;
    setConvMsgs(Array.isArray(msgs) ? msgs : []);
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

  async function handleUpdateTicketStatus(parmeId: string, status: string) {
    setTicketBusyId(parmeId);
    const tid = toast.loading("Atualizando ticket…");
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status })
        .eq("id", parmeId);
      if (error) throw error;
      setTickets((prev) =>
        prev.map((t) => (t.parme_id === parmeId ? { ...t, status } : t)),
      );
      toast.success("Ticket atualizado", { id: tid });
    } catch (e: any) {
      toast.error("Falha ao atualizar", { id: tid, description: e.message });
    } finally {
      setTicketBusyId(null);
    }
  }

  async function handleDeleteTicket(parmeId: string) {
    setTicketBusyId(parmeId);
    const tid = toast.loading("Excluindo ticket…");
    try {
      const { error } = await supabase
        .from("support_tickets")
        .delete()
        .eq("id", parmeId);
      if (error) throw error;
      setTickets((prev) => prev.filter((t) => t.parme_id !== parmeId));
      toast.success("Ticket excluído", { id: tid });
    } catch (e: any) {
      toast.error("Falha ao excluir", { id: tid, description: e.message });
    } finally {
      setTicketBusyId(null);
    }
  }


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
          (t.title ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.order_number ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [tickets, q]);


  const filteredConversations = useMemo(() => {
    return conversations.filter((c: any) => {
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      // Conta qualquer entrada que NÃO seja assistant/ai/bot/system como mensagem do cliente.
      const userMsgs = msgs.filter(isClientMessage);
      const hasTicket = (c.related_tickets?.length ?? 0) > 0 || c.source === "ticket";
      // Conversas com ticket precisam aparecer mesmo quando o histórico completo antigo não existe.
      if (!hasTicket && userMsgs.length <= 1) return false;
      if (q) {
        const blob = JSON.stringify({ m: c.client_meta, msgs, tickets: c.related_tickets }).toLowerCase();
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

      <Tabs defaultValue="reservations" className="w-full">
        <TabsList className="w-full h-auto p-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1 bg-muted sticky top-[68px] z-[9] backdrop-blur">
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
          <TabsTrigger value="reviews" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Star className="h-4 w-4" />
            <span>Avaliações</span>
          </TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5 py-2 data-[state=active]:shadow-sm">
            <Bot className="h-4 w-4" />
            <span>Agente IA</span>
          </TabsTrigger>
        </TabsList>

        {/* Reservas */}
        <TabsContent value="reservations" className="mt-4 space-y-3">
          <ReservationsKPIs reservations={filteredReservations} />
          <div className="flex justify-end">

            <Button
              variant="outline"
              size="sm"
              onClick={() => setReservationSettingsOpen(true)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Configurações
            </Button>
          </div>
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
        <TabsContent value="tickets" className="mt-4 space-y-3">
          <TicketsKPIs tickets={filteredTickets} />
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  ) : filteredTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                      const fallbackTitle = (t.description ?? "")
                        .replace(/^Conversa\s+[^\n]+\n/i, "")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 60);
                      const titulo = (t.title ?? "").trim() || fallbackTitle || "—";
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
                            <TableCell className="font-medium max-w-[220px]">
                              <div className="truncate" title={titulo}>{titulo}</div>
                            </TableCell>
                            <TableCell>{t.contact ?? "—"}</TableCell>
                            <TableCell className="max-w-md">
                              <div className="line-clamp-2 text-sm">{t.description ?? "—"}</div>
                            </TableCell>
                            <TableCell>
                              {t.status ? <Badge variant="outline">{translateStatus(t.status)}</Badge> : "—"}
                            </TableCell>
                            <TableCell>{fmtDateTime(t.created_at)}</TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <Select
                                  value={(t.status ?? "open").toLowerCase()}
                                  onValueChange={(v) => handleUpdateTicketStatus(t.parme_id, v)}
                                  disabled={ticketBusyId === t.parme_id}
                                >
                                  <SelectTrigger className="h-8 w-[150px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Aberto</SelectItem>
                                    <SelectItem value="in_progress">Em andamento</SelectItem>
                                    <SelectItem value="waiting">Aguardando</SelectItem>
                                    <SelectItem value="resolved">Resolvido</SelectItem>
                                    <SelectItem value="closed">Fechado</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(t.status ?? "").toLowerCase() !== "resolved" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1"
                                    disabled={ticketBusyId === t.parme_id}
                                    onClick={() => handleUpdateTicketStatus(t.parme_id, "resolved")}
                                    title="Marcar como resolvido"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                )}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-destructive hover:text-destructive"
                                      disabled={ticketBusyId === t.parme_id}
                                      title="Excluir ticket"
                                    >
                                      {ticketBusyId === t.parme_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir ticket?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação remove o ticket permanentemente. Não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteTicket(t.parme_id)}
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
                          {isOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={7} className="p-0">

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
        <TabsContent value="conversations" className="mt-4 space-y-3">
          <ConversationsKPIs conversations={filteredConversations} />
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="hidden md:table-cell">Prévia</TableHead>
                    <TableHead>Msgs</TableHead>
                    <TableHead>Última mensagem</TableHead>
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
                    filteredConversations.map((c: any) => {
                      const phone =
                        c.client_meta?.phone ??
                        c.client_meta?.telefone ??
                        "—";
                      const nome = pickClientName(c);
                      const msgs = Array.isArray(c.messages) ? c.messages : [];
                      const clientMsgs = msgs.filter((m: any) => isClientMessage(m));
                      const preview = clientMsgs.length
                        ? messageText(clientMsgs[clientMsgs.length - 1]).slice(0, 80)
                        : "—";
                      const ticketsCount = c.related_tickets?.length ?? 0;
                      const reservPhone = onlyDigits(String(phone));
                      const reservCount = reservPhone.length >= 8
                        ? reservations.filter((r) => {
                            const rp = onlyDigits(r.phone);
                            return rp.length >= 8 && (rp.endsWith(reservPhone) || reservPhone.endsWith(rp));
                          }).length
                        : 0;
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedConvId(c.id)}
                        >
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{String(nome)}</span>
                              {ticketsCount > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5">
                                  <Ticket className="h-3 w-3 mr-1" />{ticketsCount}
                                </Badge>
                              )}
                              {reservCount > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5">
                                  <Calendar className="h-3 w-3 mr-1" />{reservCount}
                                </Badge>
                              )}
                              {clientMsgs.length === 1 && (
                                <Badge variant="secondary" className="text-[10px] h-5">curta</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{String(phone)}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs truncate">
                            {preview}
                          </TableCell>
                          <TableCell>{c.message_count ?? "—"}</TableCell>
                          <TableCell>{fmtDateTime(c.last_message_at)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Modal: conversa completa */}
          <Dialog open={!!expandedConvId} onOpenChange={(o) => !o && setExpandedConvId(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              {(() => {
                const c = conversations.find((x) => x.id === expandedConvId) as any;
                if (!c) return null;
                const phone =
                  c.client_meta?.phone ??
                  c.client_meta?.telefone ??
                  c.client_meta?.name ??
                  "—";
                const nome = pickClientName(c);
                const msgsForInfo = (convMsgs && convMsgs.length > 0)
                  ? convMsgs
                  : (Array.isArray(c.messages) ? c.messages : null);
                const clientInfo = extractClientInfo(c, msgsForInfo);
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        {nome !== "—" ? nome : String(phone)}
                      </DialogTitle>
                      <DialogDescription className="flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          {c.message_count ?? 0} mensagens · {fmtDateTime(c.last_message_at)}
                          {nome !== "—" && phone !== "—" ? ` · ${String(phone)}` : ""}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={showClientInfo ? "secondary" : "outline"}
                          onClick={() => setShowClientInfo((v) => !v)}
                          className="h-7 text-xs"
                        >
                          {showClientInfo ? "Ocultar dados do cliente" : "Ver dados do cliente"}
                        </Button>
                      </DialogDescription>
                    </DialogHeader>

                    {showClientInfo && (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                        <div className="font-medium text-sm mb-2 text-foreground">
                          Informações capturadas
                        </div>
                        {Object.keys(clientInfo).length === 0 ? (
                          <div className="text-muted-foreground">
                            Nenhuma informação adicional identificada.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(clientInfo).map(([k, v]) => (
                              <div key={k} className="flex flex-col">
                                <span className="text-muted-foreground">{k}</span>
                                <span className="font-medium text-foreground break-words">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto -mx-6 px-6">
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
                        <div className="space-y-2">
                          {convMsgs.map((m: any, i: number) => {
                            const role = m.role ?? m.author ?? m.from ?? "user";
                            const isAssistant =
                              role === "assistant" || role === "ai" || role === "bot";
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
                                      ? "bg-muted border"
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
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </TabsContent>




        <TabsContent value="reviews" className="mt-4 space-y-4">
          <CustomerReviews embedded />
        </TabsContent>




        <TabsContent value="agent" className="mt-4">
          <AgentPanel />
        </TabsContent>

      </Tabs>
      <ReservationSettingsDialog
        open={reservationSettingsOpen}
        onOpenChange={setReservationSettingsOpen}
      />
    </div>
  );
}


// ---------- KPI strips por aba ----------

function StatCard({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: string | number;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    tone === "primary" ? "text-primary" : "text-foreground";
  const bgCls =
    tone === "success" ? "bg-success/10" :
    tone === "warning" ? "bg-warning/10" :
    tone === "destructive" ? "bg-destructive/10" :
    tone === "primary" ? "bg-primary/10" : "bg-muted";
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${bgCls}`}>
          <Icon className={`h-4 w-4 ${toneCls}`} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className={`text-xl font-bold tabular-nums ${toneCls}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReservationsKPIs({ reservations }: { reservations: Reservation[] }) {
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    let hoje = 0, prox7 = 0, pend = 0, conf = 0;
    reservations.forEach((r) => {
      const st = (r.status ?? "").toLowerCase();
      if (st === "pending") pend++;
      if (st === "confirmed") conf++;
      if (!r.reservation_date) return;
      const d = new Date(r.reservation_date); d.setHours(0,0,0,0);
      if (d.getTime() === today.getTime()) hoje++;
      if (d >= today && d <= in7) prox7++;
    });
    return { hoje, prox7, pend, conf };
  }, [reservations]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <StatCard icon={Calendar} label="Hoje" value={stats.hoje} tone="primary" />
      <StatCard icon={Calendar} label="Próximos 7 dias" value={stats.prox7} />
      <StatCard icon={Clock} label="Pendentes" value={stats.pend} tone="warning" />
      <StatCard icon={CheckCircle} label="Confirmadas" value={stats.conf} tone="success" />
    </div>
  );
}

function TicketsKPIs({ tickets }: { tickets: Ticket[] }) {
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let abertos = 0, andamento = 0, resolvHoje = 0, total = tickets.length;
    tickets.forEach((t) => {
      const st = (t.status ?? "").toLowerCase();
      if (st === "open") abertos++;
      else if (st === "in_progress" || st === "in-progress") andamento++;
      if ((st === "resolved" || st === "closed") && ((t.created_at ?? "").slice(0, 10) === todayStr)) resolvHoje++;
    });
    return { abertos, andamento, resolvHoje, total };
  }, [tickets]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <StatCard icon={AlertCircle} label="Abertos" value={stats.abertos} tone="destructive" />
      <StatCard icon={Loader2} label="Em andamento" value={stats.andamento} tone="warning" />
      <StatCard icon={CheckCircle2} label="Resolvidos hoje" value={stats.resolvHoje} tone="success" />
      <StatCard icon={Ticket} label="Total" value={stats.total} />
    </div>
  );
}

function ConversationsKPIs({ conversations }: { conversations: Conversation[] }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const dia = 24 * 60 * 60 * 1000;
    let ult24 = 0, semResposta = 0;
    const marcas = new Map<string, number>();
    conversations.forEach((c: any) => {
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      const last = msgs[msgs.length - 1];
      const lastTs = last?.timestamp || last?.created_at || c.updated_at || c.created_at;
      if (lastTs && now - new Date(lastTs).getTime() <= dia) ult24++;
      if (last && isClientMessage(last)) semResposta++;
      const m = (c.extracted?.marca as string) ?? "Sem marca";
      marcas.set(m, (marcas.get(m) ?? 0) + 1);
    });
    const top = Array.from(marcas.entries()).sort((a,b) => b[1] - a[1])[0];
    return { total: conversations.length, ult24, semResposta, topMarca: top ? top[0] : "—" };
  }, [conversations]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <StatCard icon={MessageSquare} label="Total" value={stats.total} />
      <StatCard icon={AlertCircle} label="Sem resposta" value={stats.semResposta} tone="warning" />
      <StatCard icon={Clock} label="Últimas 24h" value={stats.ult24} tone="primary" />
      <StatCard icon={Users} label="Top marca" value={stats.topMarca} />
    </div>
  );
}
