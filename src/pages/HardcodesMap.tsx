import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Code2, RefreshCw, FileDown, Search, Loader2 } from "lucide-react";
import {
  HARDCODES_SEED, HARDCODE_AREAS, HARDCODE_STATUSES, STATUS_LABELS,
  PRIORITY_LABELS, type HardcodeStatus,
} from "@/lib/hardcodesSeed";
import { jsPDF } from "jspdf";

type Row = {
  id: string;
  code: string;
  area: string;
  file_path: string;
  description: string;
  priority: string;
  suggested_fix: string;
  status: string;
  assignee: string | null;
  notes: string | null;
  resolved_at: string | null;
};

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

const statusVariant = (s: string) =>
  s === "resolvido" ? "bg-success/15 text-success border-success/30"
  : s === "em_andamento" ? "bg-warning/15 text-warning border-warning/30"
  : s === "ignorado" ? "bg-muted text-muted-foreground border-border"
  : "bg-secondary text-secondary-foreground border-border";

const priorityVariant = (p: string) =>
  p === "P0" ? "bg-destructive/15 text-destructive border-destructive/30"
  : p === "P1" ? "bg-warning/15 text-warning border-warning/30"
  : p === "P2" ? "bg-primary/10 text-primary border-primary/30"
  : "bg-muted text-muted-foreground border-border";

export default function HardcodesMap() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ status: "pendente", assignee: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_hardcodes")
      .select("*")
      .order("code", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  const sync = async (silent = false) => {
    setSyncing(true);
    try {
      const { data: existing, error: exErr } = await supabase
        .from("system_hardcodes")
        .select("code");
      if (exErr) throw exErr;
      const known = new Set((existing ?? []).map((r: { code: string }) => r.code));
      const missing = HARDCODES_SEED.filter((s) => !known.has(s.code)).map((s, i) => ({
        ...s,
        sort_order: i,
      }));
      if (missing.length) {
        const { error } = await supabase.from("system_hardcodes").insert(missing);
        if (error) throw error;
      }
      if (!silent) {
        toast({
          title: "Inventário atualizado",
          description: missing.length
            ? `${missing.length} novo(s) item(ns) adicionado(s).`
            : "Nenhum item novo. Status existentes preservados.",
        });
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!silent) toast({ title: "Erro ao sincronizar", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("system_hardcodes")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) === 0) await sync(true);
      else await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (area !== "all" && r.area !== area) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return [r.code, r.file_path, r.description, r.suggested_fix, r.assignee ?? ""]
        .join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, area, priority, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      if (!map.has(r.area)) map.set(r.area, []);
      map.get(r.area)!.push(r);
    }
    return Array.from(map.entries()).sort(
      (a, b) => HARDCODE_AREAS.indexOf(a[0] as never) - HARDCODE_AREAS.indexOf(b[0] as never),
    );
  }, [filtered]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.status === "resolvido" || r.status === "ignorado").length;
    const byPriority = PRIORITIES.map((p) => {
      const items = rows.filter((r) => r.priority === p);
      const ok = items.filter((r) => r.status === "resolvido" || r.status === "ignorado").length;
      return { p, total: items.length, ok };
    });
    return { total: rows.length, done, byPriority };
  }, [rows]);

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ status: r.status, assignee: r.assignee ?? "", notes: r.notes ?? "" });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("system_hardcodes")
      .update({
        status: form.status,
        assignee: form.assignee || null,
        notes: form.notes || null,
        resolved_at: form.status === "resolvido" ? new Date().toISOString() : null,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item atualizado" });
    setEditing(null);
    load();
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 16;
    doc.setFontSize(14);
    doc.text("NEXA - Mapa de hardcodes", 12, y);
    doc.setFontSize(9);
    y += 6;
    doc.text(
      `${stats.done}/${stats.total} resolvidos - gerado em ${new Date().toLocaleString("pt-BR")}`,
      12, y,
    );
    y += 8;
    for (const [areaName, items] of grouped) {
      if (y > 185) { doc.addPage(); y = 16; }
      doc.setFontSize(11);
      doc.text(areaName, 12, y);
      y += 5;
      doc.setFontSize(8);
      for (const r of items) {
        if (y > 195) { doc.addPage(); y = 16; }
        const line = `${r.code} [${r.priority}] ${STATUS_LABELS[r.status as HardcodeStatus] ?? r.status} - ${r.file_path}`;
        doc.text(doc.splitTextToSize(line, W - 24), 14, y);
        y += 4;
        const fix = `   ${r.description} -> ${r.suggested_fix}`;
        const wrapped = doc.splitTextToSize(fix, W - 28) as string[];
        doc.text(wrapped, 14, y);
        y += 4 * wrapped.length + 2;
      }
      y += 3;
    }
    doc.save("mapa-hardcodes-nexa.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Code2 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Mapa de hardcodes
        </h1>
        <p className="text-muted-foreground">
          Inventário dos valores fixos no código, com solução sugerida e acompanhamento do status.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => sync()} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Recarregar inventário
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={!rows.length}>
          <FileDown className="h-4 w-4 mr-2" />
          Exportar PDF
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Progresso geral — {stats.done} de {stats.total} tratados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={stats.total ? (stats.done / stats.total) * 100 : 0} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.byPriority.map(({ p, total, ok }) => (
              <div key={p} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={priorityVariant(p)}>{p}</Badge>
                  <span className="text-xs text-muted-foreground">{ok}/{total}</span>
                </div>
                <Progress value={total ? (ok / total) * 100 : 0} className="h-1.5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar arquivo, código, texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {HARDCODE_AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {HARDCODE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando inventário...
        </div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Nenhum item encontrado com os filtros atuais.
        </CardContent></Card>
      ) : (
        grouped.map(([areaName, items]) => (
          <Card key={areaName}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {areaName}
                <Badge variant="secondary">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                    <Badge variant="outline" className={priorityVariant(r.priority)}>{r.priority}</Badge>
                    <Badge variant="outline" className={statusVariant(r.status)}>
                      {STATUS_LABELS[r.status as HardcodeStatus] ?? r.status}
                    </Badge>
                    {r.assignee && (
                      <span className="text-xs text-muted-foreground">· {r.assignee}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium break-words">{r.description}</p>
                  <p className="font-mono text-[11px] text-muted-foreground break-all">{r.file_path}</p>
                  <p className="text-xs mt-1">
                    <span className="text-muted-foreground">Solução sugerida: </span>
                    {r.suggested_fix}
                  </p>
                  {r.notes && (
                    <p className="text-xs mt-1 text-muted-foreground italic break-words">{r.notes}</p>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing?.code} — {editing?.area}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">{editing.description}</p>
                <p className="font-mono text-[11px] text-muted-foreground break-all">{editing.file_path}</p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Solução sugerida: </span>
                  {editing.suggested_fix}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HARDCODE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input
                  value={form.assignee}
                  onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                  placeholder="Quem vai resolver"
                />
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Decisão tomada, link do commit, etc."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
