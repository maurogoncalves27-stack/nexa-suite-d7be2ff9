import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";
import type { UniformItem } from "@/lib/uniforms";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface KitItem {
  id: string;
  position: string;
  uniform_item_id: string;
  quantity: number;
}

interface Props {
  items: UniformItem[];
}

export function UniformKitsPanel({ items }: Props) {
  const { positions } = usePositions();
  const [kit, setKit] = useState<KitItem[]>([]);
  const [position, setPosition] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("uniform_kit_items").select("*").order("position");
    setKit((data ?? []) as KitItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!position && positions.length > 0) setPosition(positions[0].name);
  }, [positions, position]);

  const add = async () => {
    if (!position) { toast({ title: "Selecione o cargo", variant: "destructive" }); return; }
    if (!itemId) { toast({ title: "Selecione o item", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("uniform_kit_items").upsert(
      { position, uniform_item_id: itemId, quantity: Math.max(1, Number(qty) || 1) },
      { onConflict: "position,uniform_item_id" },
    );
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item adicionado ao kit" });
    setItemId(""); setQty("1");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("uniform_kit_items").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const itemsByPos = kit.reduce<Record<string, KitItem[]>>((acc, k) => {
    (acc[k.position] ||= []).push(k); return acc;
  }, {});

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar item ao kit por cargo</CardTitle>
          <CardDescription>Define quais peças cada cargo recebe na admissão</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {items.filter((i) => i.is_active).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
              <Button onClick={add} disabled={saving} className="gap-2 w-full sm:w-auto">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : Object.keys(itemsByPos).length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">Nenhum kit configurado.</div>
      ) : (
        <Card>
          <CardContent className="p-2">
            <Accordion type="multiple" className="w-full">
              {Object.entries(itemsByPos).map(([pos, list]) => (
                <AccordionItem key={pos} value={pos} className="border-b last:border-b-0">
                  <AccordionTrigger className="px-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      {pos}
                      <Badge variant="secondary" className="text-xs">{list.length} {list.length === 1 ? "item" : "itens"}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2">
                    <div className="space-y-2">
                      {list.map((k) => {
                        const it = itemMap[k.uniform_item_id];
                        return (
                          <div key={k.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                            <div className="text-sm">
                              <span className="font-medium">{k.quantity}×</span> {it?.name ?? "Item removido"}
                              {it?.is_durable && <Badge variant="outline" className="ml-2 border-primary/50 text-primary">durável</Badge>}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => remove(k.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
