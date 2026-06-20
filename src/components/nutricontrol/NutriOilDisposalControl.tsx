import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Receipt, Recycle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DisposalRecord {
  id: string;
  pickup_date: string;
  collector_name: string | null;
  liters: number | null;
  amount_received: number;
  receipt_path: string | null;
  notes: string | null;
  recorded_at: string;
  user_id: string;
}

interface Props {
  storeId: string | null;
}

const RECEIPT_BUCKET = "nutri-oil-disposal-receipts";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const NutriOilDisposalControl = ({ storeId }: Props) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<DisposalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickupDate, setPickupDate] = useState<Date>(new Date());
  const [collector, setCollector] = useState("");
  const [liters, setLiters] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "cash">("pix");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRecords = useCallback(async () => {
    if (!user || !storeId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("nutri_oil_disposal_records")
      .select("*")
      .eq("store_id", storeId)
      .order("pickup_date", { ascending: false })
      .limit(30);
    if (error) toast.error("Erro ao carregar recolhimentos");
    else setRecords((data ?? []) as DisposalRecord[]);
    setLoading(false);
  }, [user, storeId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const submit = async () => {
    if (!user) return;
    if (!storeId) return toast.error("Selecione uma loja");
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum < 0) return toast.error("Informe o valor recebido");
    const litersNum = liters.trim() ? parseFloat(liters.replace(",", ".")) : null;
    if (litersNum !== null && (isNaN(litersNum) || litersNum < 0))
      return toast.error("Quantidade de litros inválida");

    setSubmitting(true);
    let receipt_path: string | null = null;

    if (receiptFile) {
      const ext = receiptFile.name.split(".").pop() || "jpg";
      const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .upload(path, receiptFile);
      if (upErr) {
        setSubmitting(false);
        toast.error("Erro ao enviar recibo");
        return;
      }
      receipt_path = path;
    }

    const { error } = await supabase.from("nutri_oil_disposal_records").insert({
      user_id: user.id,
      store_id: storeId,
      pickup_date: format(pickupDate, "yyyy-MM-dd"),
      collector_name: collector.trim() || null,
      liters: litersNum,
      amount_received: amountNum,
      receipt_path,
      notes: paymentMethod === "pix" ? "Pago via PIX" : "Pago em dinheiro",
    });

    setSubmitting(false);
    if (error) {
      toast.error(`Erro ao registrar: ${error.message}`);
    } else {
      toast.success("Recolhimento registrado");
      setPickupDate(new Date());
      setCollector("");
      setLiters("");
      setAmount("");
      setPaymentMethod("pix");
      setReceiptFile(null);
      fetchRecords();
    }
  };

  const removeRecord = async (r: DisposalRecord) => {
    const { error } = await supabase
      .from("nutri_oil_disposal_records")
      .delete()
      .eq("id", r.id);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    if (r.receipt_path) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([r.receipt_path]);
    }
    fetchRecords();
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, 60 * 10); // 10 min
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o recibo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const totalAmount = records.reduce((sum, r) => sum + Number(r.amount_received || 0), 0);

  return (
    <div className="bg-card border border-border rounded-lg p-3 mt-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Recycle className="h-4 w-4 text-primary" />
          Recolhimento de Óleo (Reciclagem)
        </h4>
        {records.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Total recebido (últimos {records.length}): <strong className="text-foreground">{formatCurrency(totalAmount)}</strong>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data do recolhimento</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start text-left font-normal text-sm",
                  !pickupDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {pickupDate ? format(pickupDate, "dd/MM/yyyy") : "Selecione"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pickupDate}
                onSelect={(d) => d && setPickupDate(d)}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Empresa coletora</label>
          <Input
            value={collector}
            onChange={(e) => setCollector(e.target.value)}
            placeholder="Nome da empresa"
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Litros (opcional)</label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            placeholder="0"
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Valor recebido (R$)</label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <Receipt className="h-3.5 w-3.5" />
            Recibo (foto ou PDF)
          </label>
          <Input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="h-9 text-sm"
          />
          {receiptFile && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{receiptFile.name}</p>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Forma de pagamento</label>
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "pix" | "cash")}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={submit} disabled={submitting} size="sm" className="gap-1 mb-3">
        <Plus className="h-4 w-4" />
        {submitting ? "Registrando..." : "Registrar recolhimento"}
      </Button>

      <div className="space-y-1.5">
        {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
        {!loading && records.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum recolhimento registrado.</p>
        )}
        {!loading &&
          records.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5 flex-wrap"
            >
              <span className="text-xs font-semibold text-foreground">
                {format(new Date(r.pickup_date + "T00:00:00"), "dd/MM/yyyy")}
              </span>
              {r.collector_name && (
                <span className="text-xs text-foreground truncate max-w-[180px]">
                  {r.collector_name}
                </span>
              )}
              {r.liters !== null && (
                <span className="text-xs text-muted-foreground">
                  {Number(r.liters).toLocaleString("pt-BR")} L
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                {formatCurrency(Number(r.amount_received))}
              </span>
              {r.notes && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  — {r.notes}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {r.receipt_path && (
                  <a
                    href={getReceiptUrl(r.receipt_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Recibo
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeRecord(r)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
