import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle, ArrowLeft, BarChart3, BellRing, Check, ChevronDown, Copy, Flame, HelpCircle,
  Lightbulb, Loader2, Settings, Siren, Sparkles, X, Zap,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import OccurrencesManagerDialog from "@/components/occurrences/OccurrencesManagerDialog";
import { AudioRecorderButton } from "@/components/AudioRecorderButton";
import { Link } from "react-router-dom";
import { getCurrentPosition, haversineDistanceMeters } from "@/lib/timeClock";

interface OccLite {
  id: string;
  code: string;
  category: string | null;
  occurrence: string;
  order_correct: boolean;
}

interface Analysis {
  precisa_mais_info: boolean;
  perguntas: string[];
  ocorrencia_principal: (OccLite & { confianca: string; por_que: string }) | null;
  alternativas: (OccLite & { por_que: string })[];
  diagnostico: string;
  causa_raiz: string;
  caso_interno?: boolean;
  pedido_necessario?: boolean;
  mensagem_cliente: string;
  plano_acao: string[];
  prevencao?: string[];
  alertar_gestor: boolean;
}

type Step = "describe" | "analysis";

export default function Occurrences() {
  const { user, isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;

  const [manageOpen, setManageOpen] = useState(false);
  const [step, setStep] = useState<Step>("describe");

  // Relato
  const [relato, setRelato] = useState("");
  const [contextoExtra, setContextoExtra] = useState("");
  const [orderNumberInput, setOrderNumberInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Análise
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [chosenOccId, setChosenOccId] = useState<string | null>(null);
  const [editedMsg, setEditedMsg] = useState("");

  // Normaliza texto vindo em CAIXA ALTA do catálogo: converte para minúsculas e
  // capitaliza a primeira letra de cada frase.
  const normalizeMsg = (raw: string): string => {
    if (!raw) return "";
    // Conta proporção de letras maiúsculas vs minúsculas (ignora dígitos/pontuação)
    const letters = raw.match(/\p{L}/gu) ?? [];
    if (letters.length === 0) return raw;
    const uppers = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    const ratio = uppers / letters.length;
    // Se mais de 70% das letras são maiúsculas, considera "caixa alta" e normaliza
    if (ratio < 0.7) return raw;
    const lower = raw.toLowerCase();
    return lower.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (_m, p1, p2) => p1 + p2.toUpperCase());
  };

  // Registrar
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertOrderNumber, setAlertOrderNumber] = useState("");
  const [alertOrderValue, setAlertOrderValue] = useState("");
  const [alertingId, setAlertingId] = useState<string | null>(null);

  // Atalhos rápidos (ocorrências mais usadas nos últimos 90 dias)
  const [topShortcuts, setTopShortcuts] = useState<
    { id: string; code: string; category: string | null; occurrence: string; uses: number }[]
  >([]);

  // Diálogo único "pedir nº do pedido + se foi enviado correto" — usado pelo atalho rápido E pelo card "Conte o que aconteceu"
  // Quando vem do atalho, `occ` está preenchido (pula análise da IA).
  // Quando vem do "Conte o que aconteceu", `occ` é null (e roda a análise da IA depois).
  const [shortcutOrderDialog, setShortcutOrderDialog] = useState<
    | {
        occ: { id: string; code: string; category: string | null; occurrence: string } | null;
        orderNumber: string;
        orderValue: string;
        /** "yes" = pedido enviado corretamente; "no" = enviado errado; null = ainda não respondeu */
        orderCorrect: "yes" | "no" | null;
        /** Detalhe opcional do que houve de errado (aparece quando orderCorrect="no") */
        orderDetails: string;
      }
    | null
  >(null);

  /** Heurística: a ocorrência envolve um pedido específico do cliente? */
  const isOrderRelated = (occ: { category: string | null; occurrence: string; code: string }) => {
    const hay = `${occ.category ?? ""} ${occ.occurrence} ${occ.code}`.toLowerCase();
    const keywords = [
      "pedido", "entrega", "delivery", "motoboy", "ifood", "rappi", "uber",
      "item", "itens", "produto", "lanche", "bebida", "cliente", "troca",
      "devolu", "reembolso", "estorno", "cancel", "cobran", "valor", "frio",
      "errado", "faltando", "atras", "demor",
    ];
    return keywords.some((k) => hay.includes(k));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("occurrence_alerts")
        .select("occurrence_id, occurrences!inner(id, code, category, occurrence, is_active)")
        .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .limit(500);
      if (cancelled || error || !data) return;
      const counts = new Map<string, { id: string; code: string; category: string | null; occurrence: string; uses: number }>();
      for (const row of data as unknown as {
        occurrences: { id: string; code: string; category: string | null; occurrence: string; is_active: boolean };
      }[]) {
        const o = row.occurrences;
        if (!o?.is_active) continue;
        const cur = counts.get(o.id);
        if (cur) cur.uses += 1;
        else counts.set(o.id, { id: o.id, code: o.code, category: o.category, occurrence: o.occurrence, uses: 1 });
      }
      const top = Array.from(counts.values()).sort((a, b) => b.uses - a.uses).slice(0, 6);
      setTopShortcuts(top);
    })();
    return () => { cancelled = true; };
  }, []);

  const restart = () => {
    setStep("describe");
    setRelato("");
    setContextoExtra("");
    setOrderNumberInput("");
    setAnalysis(null);
    setChosenOccId(null);
    setEditedMsg("");
  };

  /** Atalho rápido: abre o MESMO diálogo do "Conte o que aconteceu" para coletar nº e se foi enviado correto. */
  const useShortcut = async (
    occ: { id: string; code: string; category: string | null; occurrence: string },
    opts?: { orderNumber?: string; orderValue?: string; orderCorrect?: "yes" | "no"; orderDetails?: string },
  ) => {
    // Se for relacionado a pedido e ainda não temos os dados, abre o diálogo unificado.
    if (isOrderRelated(occ) && (!opts?.orderNumber || !opts?.orderCorrect)) {
      setShortcutOrderDialog({
        occ,
        orderNumber: opts?.orderNumber ?? "",
        orderValue: opts?.orderValue ?? "",
        orderCorrect: opts?.orderCorrect ?? null,
        orderDetails: opts?.orderDetails ?? "",
      });
      return;
    }

    const orderNumber = opts?.orderNumber?.trim() ?? "";
    const orderValue = opts?.orderValue?.trim() ?? "";

    if (orderNumber) setOrderNumberInput(orderNumber);
    if (orderValue) setAlertOrderValue(orderValue);
    setAlertOrderNumber(orderNumber);

    const relatoBase = `Atalho rápido: ${occ.occurrence}`;
    const pedidoLine = orderNumber ? `\nNº do pedido: ${orderNumber}` : "";
    const enviadoLine = opts?.orderCorrect
      ? `\nPedido enviado corretamente: ${opts.orderCorrect === "yes" ? "SIM" : "NÃO"}${opts.orderDetails?.trim() ? ` — ${opts.orderDetails.trim()}` : ""}`
      : "";
    setRelato(`${relatoBase}${pedidoLine}${enviadoLine}`);

    // Busca textos do catálogo (ação, mensagem, prevenção) — sem chamar a IA.
    const { data: cat } = await supabase
      .from("occurrences")
      .select("action, message, prevention_1, prevention_2")
      .eq("id", occ.id)
      .maybeSingle();

    const planoFromAction = (cat?.action ?? "")
      .split(/\n+|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);

    const prevencao = [cat?.prevention_1, cat?.prevention_2].filter(Boolean) as string[];
    const mensagem = (cat?.message ?? "").trim();

    setAnalysis({
      precisa_mais_info: false,
      perguntas: [],
      ocorrencia_principal: {
        id: occ.id,
        code: occ.code,
        category: occ.category,
        occurrence: occ.occurrence,
        order_correct: opts?.orderCorrect === "yes",
        confianca: "alta",
        por_que: "Selecionada via atalho rápido",
      },
      alternativas: [],
      diagnostico: `${occ.occurrence}${orderNumber ? ` — pedido #${orderNumber}` : ""}`,
      causa_raiz: "",
      caso_interno: !mensagem,
      pedido_necessario: isOrderRelated(occ) && !orderNumber,
      mensagem_cliente: mensagem,
      plano_acao: planoFromAction.length > 0 ? planoFromAction : ["Registre a ocorrência."],
      prevencao,
      alertar_gestor: false,
    });
    setChosenOccId(occ.id);
    setEditedMsg(normalizeMsg(mensagem));
    setStep("analysis");
  };

  /** Helper: confirma o diálogo único (atalho ou análise da IA). */
  const confirmOrderDialog = (override?: { orderCorrect?: "yes" | "no" }) => {
    const base = shortcutOrderDialog;
    if (!base) return;
    const s = { ...base, orderCorrect: override?.orderCorrect ?? base.orderCorrect };
    if (!s.orderNumber.trim()) {
      toast({ title: "Informe o nº do pedido", variant: "destructive" });
      return;
    }
    if (s.orderCorrect === null) {
      toast({ title: "Responda se o pedido foi enviado corretamente", variant: "destructive" });
      return;
    }
    setShortcutOrderDialog(null);
    const num = s.orderNumber.trim();

    if (s.occ) {
      // Veio de um atalho rápido — pula análise da IA, vai direto pro registrar.
      useShortcut(s.occ, {
        orderNumber: num,
        orderValue: s.orderValue,
        orderCorrect: s.orderCorrect,
        orderDetails: s.orderDetails,
      });
    } else {
      // Veio do "Conte o que aconteceu" — roda análise da IA com tudo no contexto.
      setOrderNumberInput(num);
      setAlertOrderNumber(num);
      const enviadoCtx =
        s.orderCorrect === "yes"
          ? "O pedido FOI enviado/preparado corretamente segundo o atendente."
          : `O pedido NÃO foi enviado/preparado corretamente segundo o atendente (houve erro nosso).${s.orderDetails.trim() ? ` Detalhe: ${s.orderDetails.trim()}` : ""}`;
      const ctxExtra = [contextoExtra, enviadoCtx].filter(Boolean).join("\n");
      runAnalysis(ctxExtra, num);
    }
  };

  /** Helper: usuário diz que não tem o nº — segue mesmo assim. (só aplicável quando vem do "Conte o que aconteceu") */
  const skipOrderDialog = () => {
    const s = shortcutOrderDialog;
    if (!s) return;
    setShortcutOrderDialog(null);
    if (s.occ) {
      // Atalho sem nº: segue pro registrar mesmo assim
      useShortcut(s.occ, {
        orderNumber: "",
        orderValue: s.orderValue,
        orderCorrect: s.orderCorrect ?? "yes",
        orderDetails: s.orderDetails,
      });
    } else {
      setOrderNumberInput("");
      runAnalysis(undefined, "__skip__");
    }
  };

  /** Detecta pelo texto do relato se parece ser sobre um pedido específico. */
  const relatoMencionaPedido = (texto: string) => {
    const t = texto.toLowerCase();
    const keywords = [
      "pedido", "entrega", "delivery", "motoboy", "ifood", "rappi", "uber",
      "item", "itens", "produto", "lanche", "bebida", "cliente", "troca",
      "devolu", "reembolso", "estorno", "cancel", "cobran", "frio",
      "errado", "faltando", "atras", "demor", "chegou", "veio",
    ];
    return keywords.some((k) => t.includes(k));
  };

  const runAnalysis = async (extra?: string, orderOverride?: string) => {
    if (relato.trim().length < 3) {
      toast({ title: "Conte o que aconteceu", description: "Escreva ao menos algumas palavras." });
      return;
    }

    // Antes de ir para a tela de análise: se o relato parece ser sobre um pedido e ainda não temos o nº, abre o diálogo.
    // Sentinel "__skip__" ignora a heurística (atendente já disse que não tem o nº).
    const skipHeuristic = orderOverride === "__skip__";
    const orderNow = skipHeuristic ? "" : (orderOverride ?? orderNumberInput).trim();
    if (!skipHeuristic && !orderNow && relatoMencionaPedido(relato)) {
      setShortcutOrderDialog({ occ: null, orderNumber: "", orderValue: "", orderCorrect: null, orderDetails: "" });
      return;
    }
    setAiLoading(true);
    try {
      const pedidoLine = orderNow
        ? `Nº do pedido: ${orderNow}`
        : "Nº do pedido: NÃO INFORMADO";
      const relatoFull = `${relato.trim()}\n${pedidoLine}`;
      const { data, error } = await supabase.functions.invoke("analyze-occurrence", {
        body: { relato: relatoFull, contexto_extra: extra ?? contextoExtra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const a = data as Analysis;
      setAnalysis(a);
      setChosenOccId(a.ocorrencia_principal?.id ?? null);
      setEditedMsg(normalizeMsg(a.mensagem_cliente ?? ""));
      setStep("analysis");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao analisar";
      toast({ title: "Falha na análise", description: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const runAnalysisWithOrder = (orderNumber: string) => runAnalysis(undefined, orderNumber);


  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(editedMsg);
      toast({ title: "Mensagem copiada!", description: "Cole no chat com o cliente." });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const openRegister = () => {
    if (!user) {
      toast({ title: "Faça login para registrar", variant: "destructive" });
      return;
    }
    if (!chosenOccId) {
      toast({ title: "Selecione a ocorrência", variant: "destructive" });
      return;
    }
    setAlertOrderNumber((prev) => orderNumberInput.trim() || prev);
    setAlertOrderValue("");
    setAlertOpen(true);
  };

  const sendRegister = async () => {
    if (!chosenOccId || !user || !analysis) return;
    setAlertingId(chosenOccId);
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("store_id, full_name, stores(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      // Tenta detectar loja pela localização atual (fallback: loja vinculada ao colaborador)
      let detectedStoreId: string | null = emp?.store_id ?? null;
      let detectedStoreName: string | null =
        (emp as { stores?: { name?: string } } | null)?.stores?.name ?? null;
      try {
        const pos = await getCurrentPosition();
        if (pos?.coords) {
          const { data: realStores } = await supabase
            .from("stores")
            .select("id, name, latitude, longitude, geofence_radius_m")
            .eq("is_active", true)
            .eq("is_virtual", false);
          let best: { id: string; name: string; dist: number; radius: number } | null = null;
          for (const s of realStores ?? []) {
            if (s.latitude == null || s.longitude == null) continue;
            const d = haversineDistanceMeters(
              pos.coords.latitude,
              pos.coords.longitude,
              Number(s.latitude),
              Number(s.longitude),
            );
            const radius = s.geofence_radius_m ?? 200;
            if (!best || d < best.dist) best = { id: s.id, name: s.name, dist: d, radius };
          }
          if (best && best.dist <= Math.max(best.radius, 500)) {
            detectedStoreId = best.id;
            detectedStoreName = best.name;
          }
        }
      } catch {
        // ignora erros de GPS — usa fallback
      }

      const orderNumber = alertOrderNumber.trim() || null;
      const orderValueRaw = alertOrderValue.trim().replace(",", ".");
      const orderValue = orderValueRaw ? Number(orderValueRaw) : null;
      if (orderValue !== null && !Number.isFinite(orderValue)) {
        toast({ title: "Valor inválido", description: "Informe um número válido em R$.", variant: "destructive" });
        setAlertingId(null);
        return;
      }
      const note = [
        `Relato: ${relato.trim()}`,
        analysis.diagnostico ? `Diagnóstico IA: ${analysis.diagnostico}` : null,
        analysis.causa_raiz ? `Causa raiz: ${analysis.causa_raiz}` : null,
      ].filter(Boolean).join("\n");

      const { error: insErr } = await supabase.from("occurrence_alerts").insert({
        occurrence_id: chosenOccId,
        created_by: user.id,
        store_id: detectedStoreId,
        note,
        order_number: orderNumber,
        order_value: orderValue,
      });
      if (insErr) throw insErr;

      const chosen = [analysis.ocorrencia_principal, ...analysis.alternativas].find((o) => o?.id === chosenOccId);

      const { data: managers } = await supabase.rpc("get_manager_user_ids");
      const uniqueIds = Array.from(
        new Set(((managers ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))
      ).filter((id) => id !== user.id);
      const reporter = detectedStoreName || "Loja não identificada";

      // Resumo curto e claro do problema (1 linha)
      const resumo = (analysis.diagnostico || chosen?.occurrence || "Ocorrência registrada")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);

      // Título curto, sem emojis (sirene aparece como ícone na UI do sino)
      const problemaCurto = (chosen?.occurrence ?? "Ocorrência")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      const title = problemaCurto;

      // Corpo: loja • pedido • valor • resumo
      const linha1Parts = [
        reporter,
        orderNumber ? `#${orderNumber}` : null,
        orderValue !== null ? `R$ ${orderValue.toFixed(2).replace(".", ",")}` : null,
      ].filter(Boolean);
      const fullMsg = [linha1Parts.join(" • "), resumo].filter(Boolean).join("\n");


      await Promise.all(
        uniqueIds.map((uid) =>
          supabase.functions.invoke("notify-user", {
            body: {
              user_id: uid,
              title,
              message: fullMsg,
              url: "/ocorrencias/relatorio",
              tag: `occurrence-${chosenOccId}`,
              category: "occurrence",
            },
          }),
        ),
      );
      toast({ title: "Ocorrência registrada", description: "Os gestores foram notificados." });
      setAlertOpen(false);
      restart();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao registrar";
      toast({ title: "Falha ao registrar", description: msg, variant: "destructive" });
    } finally {
      setAlertingId(null);
    }
  };

  const Stepper = () => {
    const steps: { key: Step; label: string }[] = [
      { key: "describe", label: "Relatar" },
      { key: "analysis", label: "Resolver" },
    ];
    const currentIdx = steps.findIndex((s) => s.key === step);
    return (
      <div className="flex items-center gap-1.5 text-xs md:text-sm">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const reachable = i <= currentIdx;
          return (
            <button
              key={s.key}
              disabled={!reachable}
              onClick={() => reachable && setStep(s.key)}
              className={`px-2.5 py-1 rounded-full border transition-colors
                ${current ? "bg-primary text-primary-foreground border-primary font-semibold" : ""}
                ${done ? "bg-primary/10 text-primary border-primary/30" : ""}
                ${!current && !done ? "text-muted-foreground border-border" : ""}
                ${!reachable ? "opacity-40 cursor-not-allowed" : "hover:bg-accent"}`}
            >
              {done && <Check className="h-3 w-3 inline mr-1" />}
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>
    );
  };

  // Mostrar SEMPRE apenas 1 ocorrência identificada (sem alternativas).
  // Se a IA estiver em dúvida, ela deve usar precisa_mais_info=true + perguntas, não listar opções.
  const allOpts: (OccLite & { por_que?: string; confianca?: string })[] = analysis?.ocorrencia_principal
    ? [analysis.ocorrencia_principal]
    : [];

  return (
    <div className="container mx-auto px-3 py-4 md:py-6 max-w-4xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Siren className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Central de Ocorrências
        </h1>
        {canManage && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="h-10">
              <Link to="/ocorrencias/relatorio"><BarChart3 className="h-4 w-4 mr-1.5" /> Relatório</Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setManageOpen(true)} className="h-10">
              <Settings className="h-4 w-4 mr-1.5" /> Gerenciar
            </Button>
          </div>
        )}
      </div>



      {/* STEP 1 — Relatar */}
      {step === "describe" && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Atalhos rápidos: ocorrências mais usadas (90 dias) */}
          {topShortcuts.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
              <CardContent className="p-3 md:p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-600" />
                  <span className="font-bold text-sm">Atalhos rápidos</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {topShortcuts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => useShortcut(s)}
                      className="group text-left rounded-lg border bg-background hover:border-primary hover:bg-primary/5 transition-colors p-3 flex items-center gap-2"
                    >
                      <Zap className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-sm font-semibold leading-snug line-clamp-2 flex-1 min-w-0">{s.occurrence}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-primary/30 bg-primary/5 flex flex-col">
            <CardContent className="p-4 md:p-5 space-y-3 flex flex-col">
            <div className="flex items-center justify-center gap-2 text-lg md:text-xl font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              Conte o que aconteceu
            </div>
            <div className="relative">
              <Textarea
                placeholder="Ex: cliente acabou de ligar reclamando que o lanche chegou frio e quer cancelar"
                value={relato}
                onChange={(e) => setRelato(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runAnalysis();
                }}
                rows={4}
                className="text-base resize-none pr-14"
                autoFocus
              />
              <div className="absolute bottom-2 right-2">
                <AudioRecorderButton
                  size="sm"
                  label=""
                  onTranscript={(t) =>
                    setRelato((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
                  }
                />
              </div>
            </div>

            {orderNumberInput.trim() && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm">
                  📦 Pedido: <strong>#{orderNumberInput}</strong>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOrderNumberInput("")}
                  className="h-7 px-2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Button
              size="lg"
              onClick={() => runAnalysis()}
              disabled={aiLoading || relato.trim().length < 3}
              className="w-full h-20 text-lg md:text-xl font-bold"
            >
              {aiLoading ? <Loader2 className="h-6 w-6 mr-2 animate-spin" /> : <Sparkles className="h-6 w-6 mr-2" />}
              Analisar e resolver
            </Button>
          </CardContent>
        </Card>
        </div>
      )}

      {/* STEP 2 — Análise da IA */}
      {step === "analysis" && analysis && (
        <div className="space-y-4">
          {/* Caso a IA precise de mais info */}
          {analysis.precisa_mais_info && analysis.perguntas.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-base">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Preciso de mais alguns detalhes
                </div>
                <ul className="space-y-1.5 text-sm">
                  {analysis.perguntas.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-bold text-amber-600">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
                {analysis.pedido_necessario && !orderNumberInput.trim() && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Nº do pedido
                    </label>
                    <Input
                      placeholder="Ex: 1234"
                      value={orderNumberInput}
                      onChange={(e) => setOrderNumberInput(e.target.value.replace(/\s/g, "").slice(0, 30))}
                      inputMode="numeric"
                      className="h-11 text-base bg-background"
                    />
                  </div>
                )}
                <Textarea
                  placeholder="Responda aqui e clique em Refinar análise"
                  value={contextoExtra}
                  onChange={(e) => setContextoExtra(e.target.value)}
                  rows={3}
                  className="text-base"
                />
                <div className="flex justify-end">
                  <AudioRecorderButton
                    size="sm"
                    label="Responder por áudio"
                    onTranscript={(t) =>
                      setContextoExtra((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
                    }
                  />
                </div>
                <Button
                  onClick={() => runAnalysis(contextoExtra)}
                  disabled={aiLoading || (contextoExtra.trim().length < 2 && !orderNumberInput.trim())}
                  className="w-full h-11 font-semibold"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Refinar análise
                </Button>
              </CardContent>
            </Card>
          )}

          {/* IA pediu nº do pedido mas não está em precisa_mais_info */}
          {!analysis.precisa_mais_info && analysis.pedido_necessario && !orderNumberInput.trim() && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-base">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Informe o nº do pedido
                </div>
                <p className="text-sm text-muted-foreground">
                  Esta ocorrência envolve um pedido específico. Sem o número, não dá pra rastrear depois.
                </p>
                <Button
                  onClick={() => setShortcutOrderDialog({ occ: null, orderNumber: "", orderValue: "", orderCorrect: null, orderDetails: "" })}
                  className="w-full h-11 font-semibold"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Informar nº do pedido
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Voltar (reinicia o fluxo) */}
          <div>
            <Button size="sm" variant="ghost" onClick={restart} className="h-8 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          </div>

          {/* Sanfona com Diagnóstico + Ocorrência identificada (fechada por padrão) */}
          <Collapsible>
            <Card className="border-primary/20">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors rounded-lg group">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ver detalhes da análise
                  {analysis.ocorrencia_principal && (
                    <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
                      · {analysis.ocorrencia_principal.occurrence}
                    </span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-5 md:p-6 pt-0 space-y-4 border-t">
                  {/* Diagnóstico */}
                  <div className="space-y-2 pt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      📋 Diagnóstico
                    </div>
                    <p className="text-base leading-relaxed">{analysis.diagnostico}</p>
                    {analysis.causa_raiz && (
                      <p className="text-sm text-muted-foreground italic">
                        <Lightbulb className="h-3.5 w-3.5 inline mr-1" /> Causa raiz: {analysis.causa_raiz}
                      </p>
                    )}
                  </div>

                  {/* Ocorrência identificada + alternativas */}
                  {allOpts.length > 0 && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground pt-3">
                        🎯 Ocorrência identificada
                      </div>
                      <div className="space-y-2">
                        {allOpts.map((o, i) => {
                          const isPrincipal = i === 0;
                          const isChosen = chosenOccId === o.id;
                          return (
                            <button
                              key={o.id}
                              onClick={() => setChosenOccId(o.id)}
                              className={`w-full text-left p-4 rounded-lg border-2 transition-all
                                ${isChosen ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent"}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0
                                  ${isChosen ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                                  {isChosen && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isPrincipal && (
                                      <Badge variant="default" className="text-[10px]">Recomendada</Badge>
                                    )}
                                    {o.confianca && (
                                      <Badge variant={o.confianca === "alta" ? "default" : "outline"} className="text-[10px]">
                                        Confiança {o.confianca}
                                      </Badge>
                                    )}
                                    <Badge variant={o.order_correct ? "default" : "destructive"} className="text-[10px]">
                                      {o.order_correct ? "Pedido OK" : "Erramos"}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground font-mono">{o.code}</span>
                                  </div>
                                  <div className="text-base font-semibold leading-tight">{o.occurrence}</div>
                                  {o.por_que && (
                                    <div className="text-xs text-muted-foreground">{o.por_que}</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Plano de ação */}
          {analysis.plano_acao.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-5 space-y-3">
                {analysis.ocorrencia_principal && (
                  <div className="text-lg md:text-xl font-bold leading-tight">
                    {analysis.ocorrencia_principal.occurrence}
                  </div>
                )}
                <ol className="space-y-2.5">
                  {analysis.plano_acao.map((p, i) => (
                    <li key={i} className="flex items-start gap-3">
                      {analysis.plano_acao.length > 1 && (
                        <span className="shrink-0 h-7 w-7 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                          {i + 1}
                        </span>
                      )}
                      <span className="text-base leading-relaxed pt-0.5">{p}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Dica de prevenção (do catálogo) */}
          {analysis.prevencao && analysis.prevencao.length > 0 && (
            <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40">
              <CardContent className="p-5 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 fill-amber-400 text-amber-600 dark:text-amber-300" />
                  Dica pra evitar da próxima vez
                </div>
                <ul className="space-y-1.5">
                  {analysis.prevencao.map((p, i) => (
                    <li key={i} className="text-sm leading-relaxed text-amber-900 dark:text-amber-100 flex items-start gap-2">
                      <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Mensagem para o cliente — escondida em casos internos/operacionais */}
          {!analysis.caso_interno && editedMsg && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide">
                    💬 Mensagem
                  </div>
                  <Button size="lg" onClick={copyMessage} className="h-11 text-base font-semibold">
                    <Copy className="h-5 w-5 mr-2" /> Copiar
                  </Button>
                </div>
                <Textarea
                  value={editedMsg}
                  onChange={(e) => setEditedMsg(e.target.value)}
                  rows={5}
                  className="text-sm leading-relaxed resize-none normal-case"
                  style={{ textTransform: "none" }}
                />
              </CardContent>
            </Card>
          )}

          {/* Registrar */}
          <div className="pt-1">
            <Button
              size="lg"
              variant="default"
              onClick={openRegister}
              disabled={!chosenOccId || !!alertingId}
              className="w-full h-14 text-base md:text-lg font-bold"
            >
              {alertingId ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <BellRing className="h-5 w-5 mr-2" />}
              Registrar ocorrência
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <OccurrencesManagerDialog open={manageOpen} onOpenChange={setManageOpen} onChanged={() => {}} />
      )}

      {/* Dialog "informe o nº do pedido" — usado pelo atalho rápido E pelo card "Conte o que aconteceu" */}
      <Dialog
        open={!!shortcutOrderDialog}
        onOpenChange={(o) => { if (!o) setShortcutOrderDialog(null); }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {shortcutOrderDialog?.occ ? shortcutOrderDialog.occ.occurrence : "Nº do pedido"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-order-number">Número do pedido</Label>
              <Input
                id="shortcut-order-number"
                autoFocus
                placeholder="Ex: 1234"
                inputMode="numeric"
                value={shortcutOrderDialog?.orderNumber ?? ""}
                onChange={(e) => setShortcutOrderDialog((s) => s ? { ...s, orderNumber: e.target.value } : s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && shortcutOrderDialog?.orderNumber.trim() && shortcutOrderDialog?.orderCorrect !== null) {
                    confirmOrderDialog();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="shortcut-order-details">O que houve de errado?</Label>
              <Textarea
                id="shortcut-order-details"
                placeholder="Ex: faltou a coca-cola / veio batata em vez de mandioca / lanche frio"
                rows={2}
                value={shortcutOrderDialog?.orderDetails ?? ""}
                onChange={(e) => setShortcutOrderDialog((s) => s ? { ...s, orderDetails: e.target.value } : s)}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-2 pt-1">
              <Label>O pedido foi enviado/preparado corretamente?</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="default"
                  disabled={!shortcutOrderDialog?.orderNumber.trim()}
                  onClick={() => {
                    setShortcutOrderDialog((s) => s ? { ...s, orderCorrect: "yes" } : s);
                    confirmOrderDialog({ orderCorrect: "yes" });
                  }}
                  className="h-11 px-2 text-sm"
                >
                  <Check className="h-4 w-4 mr-1 shrink-0" /> Sim, correto
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!shortcutOrderDialog?.orderNumber.trim()}
                  onClick={() => {
                    setShortcutOrderDialog((s) => s ? { ...s, orderCorrect: "no" } : s);
                    confirmOrderDialog({ orderCorrect: "no" });
                  }}
                  className="h-11 px-2 text-sm"
                >
                  <X className="h-4 w-4 mr-1 shrink-0" /> Foi errado
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!shortcutOrderDialog?.orderNumber.trim()}
                  onClick={() => {
                    setShortcutOrderDialog((s) => s ? { ...s, orderCorrect: "no" } : s);
                    confirmOrderDialog({ orderCorrect: "no" });
                  }}
                  className="h-11 px-2 text-sm"
                >
                  <HelpCircle className="h-4 w-4 mr-1 shrink-0" /> Não tenho certeza
                </Button>
            </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Dialog Registrar — opcionais (pedido / valor) */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Registrar ocorrência
            </DialogTitle>
            <DialogDescription>
              {analysis?.ocorrencia_principal?.occurrence ?? "Confirme os dados antes de registrar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Campos opcionais. Ao registrar, os gestores serão notificados.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="alert-order-number">Número do pedido</Label>
              <Input id="alert-order-number" placeholder="Ex: 1234" value={alertOrderNumber} onChange={(e) => setAlertOrderNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-order-value">Valor do pedido (R$)</Label>
              <Input id="alert-order-value" type="text" inputMode="decimal" placeholder="Ex: 49,90" value={alertOrderValue} onChange={(e) => setAlertOrderValue(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAlertOpen(false)} disabled={!!alertingId} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button variant="default" onClick={sendRegister} disabled={!!alertingId} className="w-full sm:w-auto">
              {alertingId ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
