import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MerchandiseReceipt {
  id: string;
  received_at: string;
  batch: string;
  product_name: string;
  supplier: string;
  temperature: number;
  storage_type: string;
  has_irregularity: boolean;
  is_return: boolean;
  user_id: string;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

export const NutriMerchandiseControl = ({ currentDate, storeId }: Props) => {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<MerchandiseReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  const [batch, setBatch] = useState("");
  const [productName, setProductName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [temperature, setTemperature] = useState("");
  const [storageType, setStorageType] = useState("refrigerado");
  const [hasIrregularity, setHasIrregularity] = useState(false);
  const [isReturn, setIsReturn] = useState(false);

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchReceipts = useCallback(async () => {
    if (!user || !storeId) {
      setReceipts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("nutri_merchandise_receipts")
      .select("*")
      .eq("store_id", storeId)
      .eq("date", dateKey)
      .order("received_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar mercadorias");
    } else {
      setReceipts(data ?? []);
    }
    setLoading(false);
  }, [user, dateKey, storeId]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const resetForm = () => {
    setBatch("");
    setProductName("");
    setSupplier("");
    setTemperature("");
    setStorageType("refrigerado");
    setHasIrregularity(false);
    setIsReturn(false);
  };

  const addReceipt = async () => {
    if (!user) return;
    if (!/^\d{5}$/.test(batch)) {
      toast.error("Lote deve ter exatamente 5 dígitos");
      return;
    }
    if (!productName.trim()) return toast.error("Informe o nome do produto");
    if (!supplier.trim()) return toast.error("Informe o fornecedor");
    const tempNum = parseFloat(temperature);
    if (isNaN(tempNum)) return toast.error("Temperatura inválida");
    if (!storeId) return toast.error("Selecione uma loja");

    const { error } = await supabase.from("nutri_merchandise_receipts").insert({
      user_id: user.id,
      store_id: storeId,
      date: dateKey,
      batch,
      product_name: productName.trim(),
      supplier: supplier.trim(),
      temperature: tempNum,
      storage_type: storageType,
      has_irregularity: hasIrregularity,
      is_return: isReturn,
    });
    if (error) return toast.error("Erro ao registrar mercadoria");
    toast.success("Mercadoria registrada");
    resetForm();
    fetchReceipts();
  };

  const removeReceipt = async (id: string) => {
    const { error } = await supabase.from("nutri_merchandise_receipts").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    fetchReceipts();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h4 className="text-sm font-semibold text-foreground mb-3">Registrar entrada de mercadoria</h4>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Input
          placeholder="Lote (5 dígitos)"
          value={batch}
          onChange={(e) => setBatch(e.target.value.replace(/\D/g, "").slice(0, 5))}
          maxLength={5}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Temperatura (°C)"
          type="number"
          step="0.1"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Produto"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className="h-9 text-sm col-span-2"
        />
        <Input
          placeholder="Fornecedor"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className="h-9 text-sm col-span-2"
        />
        <Select value={storageType} onValueChange={setStorageType}>
          <SelectTrigger className="h-9 text-sm col-span-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="refrigerado">Refrigerado</SelectItem>
            <SelectItem value="congelado">Congelado</SelectItem>
            <SelectItem value="seco">Seco</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setHasIrregularity(!hasIrregularity)}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors border ${
            hasIrregularity
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          Irregularidade: {hasIrregularity ? "Sim" : "Não"}
        </button>
        <button
          type="button"
          onClick={() => setIsReturn(!isReturn)}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors border ${
            isReturn
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          Devolução: {isReturn ? "Sim" : "Não"}
        </button>
      </div>

      <Button onClick={addReceipt} size="sm" className="w-full gap-1">
        <Plus className="h-4 w-4" />
        Registrar mercadoria
      </Button>

      <div className="mt-4 space-y-2">
        <h5 className="text-xs font-semibold text-muted-foreground uppercase">Recebimentos do dia</h5>
        {loading && <p className="text-xs text-muted-foreground py-2">Carregando...</p>}
        {!loading && receipts.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">Nenhum recebimento registrado.</p>
        )}
        {!loading &&
          receipts.map((r) => (
            <div key={r.id} className="border border-border rounded-md p-3 bg-background">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{r.product_name}</span>
                    <span className="text-xs text-muted-foreground">Lote {r.batch}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Fornecedor: {r.supplier}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {r.temperature}°C
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground capitalize">
                      {r.storage_type}
                    </span>
                    {r.has_irregularity && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Irregular
                      </span>
                    )}
                    {r.is_return && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground">
                        Devolução
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(r.received_at), "HH:mm")}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeReceipt(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
