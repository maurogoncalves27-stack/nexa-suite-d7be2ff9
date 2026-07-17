import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Q {
  id: string;
  dimension: string;
  text: string;
  question_type: string;
  display_order: number;
  is_active: boolean;
}

const DIMENSIONS = ["Liderança", "Ambiente", "Reconhecimento", "Orgulho", "Geral"];
const TYPES = [
  { value: "scale_1_5", label: "Escala 1-5" },
  { value: "enps_0_10", label: "eNPS (0-10)" },
  { value: "open_text", label: "Texto aberto" },
];

export default function ClimateQuestionsPanel({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQ, setNewQ] = useState({ dimension: "Liderança", text: "", question_type: "scale_1_5" });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("climate_questions").select("*").order("display_order");
    setList((data ?? []) as Q[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newQ.text.trim()) return;
    const max = Math.max(0, ...list.map((q) => q.display_order)) + 10;
    const { error } = await supabase.from("climate_questions").insert({ ...newQ, display_order: max });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewQ({ dimension: "Liderança", text: "", question_type: "scale_1_5" });
    toast({ title: "Pergunta adicionada" });
    load(); onChanged();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await supabase.from("climate_questions").update({ is_active }).eq("id", id);
    load(); onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta pergunta? Respostas históricas serão removidas junto.")) return;
    const { error } = await supabase.from("climate_questions").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Removida" });
    load(); onChanged();
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end p-3 border rounded-md bg-card">
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="text-xs text-muted-foreground">Texto da pergunta</label>
          <Input value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} placeholder="Ex: Recebo feedback do meu gestor..." />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Dimensão</label>
          <Select value={newQ.dimension} onValueChange={(v) => setNewQ({ ...newQ, dimension: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={newQ.question_type} onValueChange={(v) => setNewQ({ ...newQ, question_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={add} className="sm:col-span-2 lg:col-span-4 w-full"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {list.map((q) => (
          <div key={q.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{q.dimension} · {TYPES.find((t) => t.value === q.question_type)?.label}</div>
                <div className="font-medium text-sm">{q.text}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(q.id)} className="shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t">
              <span className="text-xs text-muted-foreground">Ativa</span>
              <Switch checked={q.is_active} onCheckedChange={(v) => toggleActive(q.id, v)} />
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma pergunta.</div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Dimensão</TableHead>
              <TableHead>Pergunta</TableHead>
              <TableHead className="w-32">Tipo</TableHead>
              <TableHead className="w-24">Ativa</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((q) => (
              <TableRow key={q.id}>
                <TableCell>{q.dimension}</TableCell>
                <TableCell className="font-medium">{q.text}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{TYPES.find((t) => t.value === q.question_type)?.label}</TableCell>
                <TableCell>
                  <Switch checked={q.is_active} onCheckedChange={(v) => toggleActive(q.id, v)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => remove(q.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
