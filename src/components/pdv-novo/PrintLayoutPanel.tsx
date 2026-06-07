// Painel de configuração do layout de impressão por loja (cupom cliente + comanda cozinha).
// Persiste em stores.pdv_print_layout (jsonb). Não exige rebuild do app desktop:
// campos ausentes mantêm o comportamento padrão do renderer ESC/POS.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Printer, ChefHat, Receipt } from "lucide-react";

export interface PrintLayout {
  header_text?: string;       // texto extra no topo do cupom do cliente (razão, CNPJ, endereço)
  footer_text?: string;       // mensagem de rodapé do cupom do cliente
  show_address?: boolean;     // imprime endereço de entrega no cupom do cliente
  kitchen_show_prices?: boolean;     // mostra preço unitário nos itens da comanda
  kitchen_double_size?: boolean;     // texto da comanda em tamanho duplo (default true)
  kitchen_show_time?: boolean;       // mostra hora de impressão na comanda (default true)
  print_customer_copy?: boolean;     // imprime cupom do cliente automaticamente (default true)
  print_kitchen_copy?: boolean;      // imprime comanda da cozinha automaticamente (default true)
}

const DEFAULTS: PrintLayout = {
  header_text: "",
  footer_text: "Obrigado pela preferência!",
  show_address: true,
  kitchen_show_prices: false,
  kitchen_double_size: true,
  kitchen_show_time: true,
  print_customer_copy: true,
  print_kitchen_copy: true,
};

export function PrintLayoutPanel({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [layout, setLayout] = useState<PrintLayout>(DEFAULTS);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("stores")
        .select("pdv_print_layout")
        .eq("id", storeId)
        .maybeSingle();
      if (!active) return;
      setLoading(false);
      if (error) {
        toast({ title: "Erro ao carregar layout", description: error.message, variant: "destructive" });
        return;
      }
      const stored = ((data as any)?.pdv_print_layout ?? {}) as PrintLayout;
      setLayout({ ...DEFAULTS, ...stored });
    })();
    return () => { active = false; };
  }, [storeId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("stores")
      .update({ pdv_print_layout: layout } as never)
      .eq("id", storeId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Layout salvo", description: "Próximas impressões já usam o novo formato." });
  };

  const set = <K extends keyof PrintLayout>(k: K, v: PrintLayout[K]) =>
    setLayout((prev) => ({ ...prev, [k]: v }));

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cupom do cliente */}
      <section className="space-y-3 rounded-md border p-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" /> Cupom do cliente
        </h4>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="print-customer-copy" className="text-xs font-medium">
            Imprimir cupom automaticamente em novos pedidos
          </Label>
          <Switch
            id="print-customer-copy"
            checked={layout.print_customer_copy !== false}
            onCheckedChange={(v) => set("print_customer_copy", v)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="header-text" className="text-xs font-medium">
            Cabeçalho extra (razão social, CNPJ, endereço)
          </Label>
          <Textarea
            id="header-text"
            rows={2}
            value={layout.header_text ?? ""}
            onChange={(e) => set("header_text", e.target.value)}
            placeholder="Ex: Aquela Parmê LTDA · CNPJ 00.000.000/0001-00"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="footer-text" className="text-xs font-medium">Mensagem de rodapé</Label>
          <Input
            id="footer-text"
            value={layout.footer_text ?? ""}
            onChange={(e) => set("footer_text", e.target.value)}
            placeholder="Obrigado pela preferência!"
            className="h-9"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="show-address" className="text-xs font-medium">
            Mostrar endereço de entrega no cupom
          </Label>
          <Switch
            id="show-address"
            checked={layout.show_address !== false}
            onCheckedChange={(v) => set("show_address", v)}
          />
        </div>
      </section>

      {/* Comanda da cozinha */}
      <section className="space-y-3 rounded-md border p-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-primary" /> Comanda da cozinha
        </h4>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="print-kitchen-copy" className="text-xs font-medium">
            Imprimir comanda automaticamente em novos pedidos
          </Label>
          <Switch
            id="print-kitchen-copy"
            checked={layout.print_kitchen_copy !== false}
            onCheckedChange={(v) => set("print_kitchen_copy", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="kitchen-double" className="text-xs font-medium">
            Texto em tamanho grande (recomendado)
          </Label>
          <Switch
            id="kitchen-double"
            checked={layout.kitchen_double_size !== false}
            onCheckedChange={(v) => set("kitchen_double_size", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="kitchen-time" className="text-xs font-medium">
            Mostrar horário de impressão
          </Label>
          <Switch
            id="kitchen-time"
            checked={layout.kitchen_show_time !== false}
            onCheckedChange={(v) => set("kitchen_show_time", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="kitchen-prices" className="text-xs font-medium">
            Mostrar preço dos itens (geralmente desativado)
          </Label>
          <Switch
            id="kitchen-prices"
            checked={!!layout.kitchen_show_prices}
            onCheckedChange={(v) => set("kitchen_show_prices", v)}
          />
        </div>
      </section>

      <Separator />

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <Printer className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Estas opções valem para o cupom do cliente e a comanda da cozinha desta loja.
          Para testar o resultado, use o botão "Teste" em cada impressora.
        </p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Salvar layout
      </Button>
    </div>
  );
}
