import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type OfferType = "launch" | "promo" | "surplus";
type Offer = {
  id: string;
  supplier_id: string;
  offer_type: OfferType;
  title: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  available_quantity: number | null;
  image_url: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
};

const TYPE_LABELS: Record<OfferType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  launch: { label: "Lançamento", variant: "default" },
  promo: { label: "Promoção", variant: "secondary" },
  surplus: { label: "Excedente", variant: "outline" },
};

export function SupplierOffersTab({ supplierId }: { supplierId: string | null }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [form, setForm] = useState({
    offer_type: "promo" as OfferType,
    title: "",
    description: "",
    price: "",
    unit: "",
    available_quantity: "",
    valid_until: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchOffers = async () => {
    if (!supplierId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("supplier_offers")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar ofertas: " + error.message);
      return;
    }
    setOffers((data as Offer[]) ?? []);
  };

  useEffect(() => { fetchOffers(); }, [supplierId]);

  const MAX_OFFERS = 5;

  const openNew = () => {
    if (offers.length >= MAX_OFFERS) {
      toast.error(`Limite de ${MAX_OFFERS} ofertas atingido. Exclua ou edite uma existente.`);
      return;
    }
    setEditing(null);
    setForm({
      offer_type: "promo", title: "", description: "", price: "",
      unit: "", available_quantity: "", valid_until: "", is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (o: Offer) => {
    setEditing(o);
    setForm({
      offer_type: o.offer_type,
      title: o.title,
      description: o.description ?? "",
      price: o.price?.toString() ?? "",
      unit: o.unit ?? "",
      available_quantity: o.available_quantity?.toString() ?? "",
      valid_until: o.valid_until ?? "",
      is_active: o.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!supplierId) return;
    if (!form.title.trim()) {
      toast.error("Informe o título da oferta");
      return;
    }
    setSaving(true);
    const payload = {
      supplier_id: supplierId,
      offer_type: form.offer_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      price: form.price ? Number(form.price) : null,
      unit: form.unit.trim() || null,
      available_quantity: form.available_quantity ? Number(form.available_quantity) : null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("supplier_offers").update(payload).eq("id", editing.id)
      : await supabase.from("supplier_offers").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success(editing ? "Oferta atualizada" : "Oferta publicada");
    setDialogOpen(false);
    fetchOffers();
  };

  const remove = async (o: Offer) => {
    if (!confirm(`Excluir oferta "${o.title}"?`)) return;
    const { error } = await supabase.from("supplier_offers").delete().eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Oferta excluída");
    fetchOffers();
  };

  if (!supplierId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Divulgue lançamentos, promoções e excedentes diretamente para o cliente, mesmo fora das cotações.
          <span className="block mt-0.5">Máximo de 5 ofertas ({offers.length}/5 publicadas).</span>
        </p>
        <Button size="sm" onClick={openNew} disabled={offers.length >= 5}>
          <Plus className="h-4 w-4 mr-1" /> Nova oferta
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : offers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Você ainda não publicou nenhuma oferta. Clique em "Nova oferta" para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {offers.map((o) => {
            const expired = o.valid_until && new Date(o.valid_until) < new Date(new Date().toDateString());
            const t = TYPE_LABELS[o.offer_type];
            return (
              <Card key={o.id} className={!o.is_active || expired ? "opacity-60" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={t.variant} className="text-[10px]">{t.label}</Badge>
                        {!o.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                        {expired && <Badge variant="destructive" className="text-[10px]">Expirada</Badge>}
                      </div>
                      <div className="font-medium text-sm mt-1 truncate">{o.title}</div>
                      {o.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{o.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pl-6">
                    {o.price != null && (
                      <span className="font-semibold text-foreground">
                        R$ {Number(o.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        {o.unit && <span className="text-muted-foreground font-normal">/{o.unit}</span>}
                      </span>
                    )}
                    {o.available_quantity != null && <span>Disp.: {Number(o.available_quantity)} {o.unit ?? ""}</span>}
                    {o.valid_until && <span>Até: {format(new Date(o.valid_until + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>}
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1 border-t">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(o)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar oferta" : "Nova oferta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.offer_type} onValueChange={(v: OfferType) => setForm({ ...form, offer_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="launch">Lançamento / Novo produto</SelectItem>
                  <SelectItem value="promo">Promoção pontual</SelectItem>
                  <SelectItem value="surplus">Excedente / Sobra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Azeite Extra Virgem 500ml em promoção" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes do produto, marca, condições..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Preço (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value.toUpperCase() })} placeholder="UN, KG, CX..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Quantidade disponível</Label>
                <Input type="number" step="0.01" min="0" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Válida até</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Oferta ativa (visível para o cliente)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
