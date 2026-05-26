import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import EquipmentWarrantyDialog from "./EquipmentWarrantyDialog";

type Warranty = {
  id: string;
  store_id: string;
  invoice_id: string | null;
  invoice_item_id: string | null;
  equipment_name: string;
  serial_number: string | null;
  asset_tag: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  purchase_date: string | null;
  warranty_months: number;
  warranty_expires_at: string | null;
  installation_location: string | null;
  purchase_value: number | null;
  notes: string | null;
};

type StoreLite = { id: string; name: string };

const statusOf = (expires: string | null) => {
  if (!expires) return { label: "Sem prazo", variant: "secondary" as const };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expires);
  const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Expirada", variant: "destructive" as const };
  if (days <= 30) return { label: `Vence em ${days}d`, variant: "outline" as const };
  return { label: "Vigente", variant: "default" as const };
};

export const EquipmentWarrantiesPanel = () => {
  const { canReceive } = useInventoryPermission();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Warranty[]>([]);
  const [stores, setStores] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: w }, { data: s }] = await Promise.all([
      supabase
        .from("equipment_warranties")
        .select(
          "id, store_id, invoice_id, invoice_item_id, equipment_name, serial_number, asset_tag, supplier_name, invoice_number, purchase_date, warranty_months, warranty_expires_at, installation_location, purchase_value, notes",
        )
        .order("warranty_expires_at", { ascending: true, nullsFirst: false }),
      supabase.from("stores").select("id, name").eq("is_virtual", false),
    ]);
    setItems((w ?? []) as Warranty[]);
    const map: Record<string, string> = {};
    ((s ?? []) as StoreLite[]).forEach((st) => {
      map[st.id] = st.name;
    });
    setStores(map);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [
        it.equipment_name,
        it.serial_number,
        it.asset_tag,
        it.supplier_name,
        it.invoice_number,
        it.installation_location,
        stores[it.store_id],
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search, stores]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta garantia?")) return;
    const { error } = await supabase.from("equipment_warranties").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Garantia excluída");
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Garantias de equipamentos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lista de equipamentos comprados com prazo de garantia. Para cadastrar, marque o item como "equipamento" ao
          revisar a NF de recebimento.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, série, fornecedor, NF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma garantia cadastrada {search && "para o filtro"}.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((it) => {
              const status = statusOf(it.warranty_expires_at);
              return (
                <div
                  key={it.id}
                  className="rounded-lg border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{it.equipment_name}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {it.serial_number && <span>Série: {it.serial_number}</span>}
                      {it.asset_tag && <span>Patr.: {it.asset_tag}</span>}
                      {stores[it.store_id] && <span>Loja: {stores[it.store_id]}</span>}
                      {it.installation_location && <span>Local: {it.installation_location}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      {it.supplier_name && <span>Fornecedor: {it.supplier_name}</span>}
                      {it.invoice_number && <span>NF: {it.invoice_number}</span>}
                      {it.purchase_date && (
                        <span>
                          Compra: {new Date(it.purchase_date).toLocaleDateString("pt-BR")} • {it.warranty_months} meses
                        </span>
                      )}
                      {it.warranty_expires_at && (
                        <span>
                          Vence: {new Date(it.warranty_expires_at).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {it.notes && <p className="text-xs mt-1">{it.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-center">
                    {canReceive && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => setEditId(it.id)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(it.id)}
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <EquipmentWarrantyDialog
        open={!!editId}
        warrantyId={editId}
        source={null}
        onClose={() => setEditId(null)}
        onSaved={() => {
          setEditId(null);
          void load();
        }}
      />
    </Card>
  );
};

export default EquipmentWarrantiesPanel;
