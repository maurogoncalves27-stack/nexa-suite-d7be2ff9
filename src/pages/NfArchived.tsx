import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Archive, ArrowLeft, Loader2, FileText } from "lucide-react";
import DfeNoteDialog from "@/components/inventory/DfeNoteDialog";

interface Note {
  id: string;
  supplier_name: string | null;
  numero: string | null;
  serie: string | null;
  emission_date: string | null;
  total_amount: number | null;
  status: string;
  origin: string;
  target_store_id: string | null;
  imported_invoice_id: string | null;
}

export default function NfArchived() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dfe_inbound_notes")
      .select("*")
      .order("emission_date", { ascending: false })
      .limit(500);
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (n.supplier_name ?? "").toLowerCase().includes(q)
      || (n.numero ?? "").toLowerCase().includes(q);
  });

  const groups: Record<string, Note[]> = {};
  for (const n of filtered) {
    const d = n.emission_date ? new Date(n.emission_date) : new Date();
    const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase();
    (groups[key] ??= []).push(n);
  }
  const total = filtered.reduce((s, n) => s + Number(n.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/recebimento"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <Archive className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          NF arquivadas
        </h1>
        <p className="text-muted-foreground">Histórico de notas fiscais de entrada importadas e processadas.</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca rápida (fornecedor, nº NF, chave)" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span>{filtered.length} notas</span>
        <span className="font-semibold">Total: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : Object.entries(groups).map(([month, list]) => {
        const subtotal = list.reduce((s, n) => s + Number(n.total_amount || 0), 0);
        return (
          <div key={month} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider border-b pb-1">
              <span>{month}</span>
              <span>{list.length} notas • R$ {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            {list.map((n) => (
              <div key={n.id} className="rounded-lg border p-3 hover:bg-accent/30 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{n.supplier_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    NF {n.numero ?? "—"}/{n.serie ?? "—"} • Emit. {n.emission_date ? new Date(n.emission_date).toLocaleDateString("pt-BR") : "—"}
                  </p>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px]">{n.origin}</Badge>
                    <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">R$ {Number(n.total_amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <Button size="sm" variant="outline" className="mt-1 gap-1" onClick={() => setOpenId(n.id)}>
                    <FileText className="h-3 w-3" /> Abrir nota completa
                  </Button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <DfeNoteDialog noteId={openId} onClose={() => setOpenId(null)} onImported={load} />
    </div>
  );
}
