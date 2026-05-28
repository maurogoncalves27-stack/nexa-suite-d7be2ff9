// Popover "Ajustar p/ este fornecedor" — conversão de embalagem (fornecedor × produto)
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  supplierCnpj: string | null;
  productId: string | null;
  productName?: string;
  baseUnit?: string | null;
  /** Quantidade da NF nesta linha (na unidade de compra) — usada só para prévia. */
  nfQuantity?: number;
  /** Valor unitário da NF nesta linha (por unidade de compra) — usada só para prévia. */
  nfUnitValue?: number;
  /** Unidade de compra que veio da NF (ex.: FARDO, GALÃO, CX) — preenche o campo Unid. compra. */
  nfPurchaseUnit?: string | null;
  /** Conversão sugerida pelo próprio XML da NF (qTrib/qCom). */
  suggestedPackSize?: number | null;
  /** Unidade tributável que veio do XML (ex.: KG). */
  suggestedPackUnit?: string | null;
  onSaved?: (conv: { pack_size: number; purchase_unit: string | null; package_description: string | null }) => void;
  triggerLabel?: string;
  trigger?: React.ReactNode;
}

export default function SupplierConversionPopover({
  supplierCnpj, productId, productName, baseUnit, nfQuantity, nfUnitValue, nfPurchaseUnit,
  suggestedPackSize, suggestedPackUnit,
  onSaved, triggerLabel, trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [packSize, setPackSize] = useState<string>("");
  const [pkgDesc, setPkgDesc] = useState("");
  const [fromNfSuggestion, setFromNfSuggestion] = useState(false);

  // Só usa a sugestão da NF se a unidade tributável bater com a unidade base do produto
  // (caso contrário não dá pra confiar que é a mesma unidade de estoque).
  const nfSuggestionMatches =
    suggestedPackSize != null &&
    suggestedPackSize > 0 &&
    !!suggestedPackUnit &&
    !!baseUnit &&
    suggestedPackUnit.trim().toUpperCase() === baseUnit.trim().toUpperCase();

  useEffect(() => {
    if (!open || !supplierCnpj || !productId) return;
    setLoading(true);
    supabase.from("dfe_supplier_unit_conversion")
      .select("*").eq("supplier_cnpj", supplierCnpj).eq("product_id", productId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPurchaseUnit(data.purchase_unit ?? "");
          setPackSize(String(data.pack_size ?? ""));
          setPkgDesc(data.package_description ?? "");
          setFromNfSuggestion(false);
        } else if (nfSuggestionMatches) {
          setPurchaseUnit(nfPurchaseUnit ?? "");
          setPackSize(String(suggestedPackSize));
          setPkgDesc("");
          setFromNfSuggestion(true);
        } else {
          setPurchaseUnit(nfPurchaseUnit ?? "");
          setPackSize("");
          setPkgDesc("");
          setFromNfSuggestion(false);
        }
        setLoading(false);
      });
  }, [open, supplierCnpj, productId, nfPurchaseUnit, suggestedPackSize, nfSuggestionMatches]);

  const save = async () => {
    if (!supplierCnpj) {
      toast.error("Esta nota não tem CNPJ do fornecedor — não dá pra salvar conversão específica.");
      return;
    }
    if (!productId) {
      toast.error("Vincule um produto antes de salvar a conversão.");
      return;
    }
    const ps = Number(packSize);
    if (!ps || ps <= 0) return toast.error("Informe o conteúdo (quantidade na unidade de estoque)");
    setSaving(true);
    const { error } = await supabase.from("dfe_supplier_unit_conversion").upsert({
      supplier_cnpj: supplierCnpj,
      product_id: productId,
      purchase_unit: purchaseUnit || null,
      pack_size: ps,
      package_description: pkgDesc || null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "supplier_cnpj,product_id" });
    setSaving(false);
    if (error) {
      console.error("[SupplierConversion] save error:", error);
      return toast.error(error.message);
    }
    toast.success("Conversão salva para este fornecedor");
    onSaved?.({ pack_size: ps, purchase_unit: purchaseUnit || null, package_description: pkgDesc || null });
    setOpen(false);
  };

  const disabled = !supplierCnpj || !productId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled}
            className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" /> {triggerLabel ?? "Ajustar p/ este fornecedor"}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Conversão específica deste fornecedor</p>
            <p className="text-xs text-muted-foreground">
              Quanto vem em 1 embalagem deste fornecedor para o produto
              {productName ? <> <strong>{productName}</strong></> : ""}.
            </p>
          </div>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <>
              {fromNfSuggestion && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground">
                  <p className="font-medium">Sugerido pela NF</p>
                  <p className="text-muted-foreground">
                    O XML traz <strong>1 {nfPurchaseUnit || "emb"} = {suggestedPackSize} {suggestedPackUnit}</strong> (par tributável).
                    Confira e clique em <strong>Salvar</strong> para virar regra deste fornecedor.
                  </p>
                </div>
              )}
              {!fromNfSuggestion && suggestedPackSize != null && suggestedPackSize > 0 && !nfSuggestionMatches && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-foreground">
                  <p className="font-medium">NF traz {suggestedPackSize} {suggestedPackUnit} por {nfPurchaseUnit || "emb"}</p>
                  <p className="text-muted-foreground">
                    Mas a unidade tributável (<strong>{suggestedPackUnit}</strong>) é diferente da unidade do produto (<strong>{baseUnit}</strong>). Informe a conversão manualmente.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Unid. compra</Label>
                  <Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="GALÃO" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Conteúdo {baseUnit ? `(${baseUnit})` : ""}</Label>
                  <Input
                    type="number" step="0.001" min="0"
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    placeholder="3.3"
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrição da embalagem (opcional)</Label>
                <Input value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} placeholder="ex.: 5 un de 5kg" className="h-9" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Apenas informativo, ajuda na conferência física. Não afeta cálculos.
                </p>
              </div>
              {(() => {
                const ps = Number(packSize);
                const validConv = ps > 0;
                const hasNf = nfQuantity != null && nfUnitValue != null && nfQuantity > 0;
                const totalQty = hasNf && validConv ? Number(nfQuantity) * ps : null;
                const unitCost = hasNf && validConv ? Number(nfUnitValue) / ps : null;
                return (
                  <div className="rounded-md border bg-muted/30 p-2 space-y-1 text-[11px]">
                    <p className="font-medium text-foreground">
                      1 {purchaseUnit || "embalagem"} = {validConv ? ps : "?"} {baseUnit || "un"}
                    </p>
                    {hasNf && (
                      <div className="text-muted-foreground space-y-0.5">
                        <p>
                          NF: <strong>{Number(nfQuantity).toLocaleString("pt-BR")} {purchaseUnit || nfPurchaseUnit || "emb"}</strong>
                          {" "}a <strong>R$ {Number(nfUnitValue).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:4})}</strong>/{purchaseUnit || nfPurchaseUnit || "emb"}
                        </p>
                        {validConv ? (
                          <p>
                            Estoque: <strong className="text-foreground">{totalQty!.toLocaleString("pt-BR")} {baseUnit || "un"}</strong>
                            {" "}a <strong className="text-foreground">R$ {unitCost!.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:4})}</strong>/{baseUnit || "un"}
                          </p>
                        ) : (
                          <p className="italic">informe o conteúdo para ver a prévia</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Salvar
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
