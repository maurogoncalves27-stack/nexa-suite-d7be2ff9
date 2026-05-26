// Painel de cadastro/edição de impressoras térmicas por loja.
// Usado dentro do dialog de Configurações do Balcão.
// Suporta USB (Bematech MP-4200, etc.) e Rede (Gertec G250w WiFi, etc.).
// Botão "Teste" usa window.print() temporariamente; será trocado pela ponte Electron na Fase 2.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Printer, Wifi, Usb, AlertTriangle, Search, CheckCircle2 } from "lucide-react";
import { isElectron, listSystemPrinters, printViaElectron, type ElectronPrinterInfo } from "@/lib/electronBridge";
import { invalidatePrintersCache } from "@/lib/routePrint";

interface PrinterRow {
  id: string;
  store_id: string;
  name: string;
  connection_type: "usb" | "network";
  host: string | null;
  port: number | null;
  usb_device_name: string | null;
  printer_model: string;
  print_role: "customer" | "kitchen" | "both" | "totem";
  is_default: boolean;
  is_active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  customer: "Cupom do cliente (balcão)",
  kitchen: "Comanda da cozinha",
  both: "Ambos (cliente + cozinha)",
  totem: "Cupom do totem (autoatendimento)",
};

const MODELS: Record<string, string> = {
  bematech_mp4200: "Bematech MP-4200 TH",
  gertec_g250: "Gertec G250 / G250w",
  epson_generic: "Epson genérica (ESC/POS)",
};

export function PrintersPanel({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [systemPrinters, setSystemPrinters] = useState<ElectronPrinterInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const desktopOn = isElectron();
  const [draft, setDraft] = useState<Partial<PrinterRow>>({
    name: "",
    connection_type: "usb",
    printer_model: "bematech_mp4200",
    print_role: "both",
    port: 9100,
  });

  const detectUsb = async () => {
    if (!desktopOn) {
      toast({ title: "Detecção USB indisponível", description: "Disponível apenas no app desktop Nexa Balcão.", variant: "destructive" });
      return;
    }
    setScanning(true);
    const list = await listSystemPrinters();
    setScanning(false);
    setSystemPrinters(list);
    toast({ title: `${list.length} impressora(s) encontrada(s)` });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pdv_printers")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");
    setLoading(false);
    if (error) { toast({ title: "Erro ao carregar impressoras", description: error.message, variant: "destructive" }); return; }
    setPrinters((data ?? []) as PrinterRow[]);
    invalidatePrintersCache(storeId);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.name?.trim()) { toast({ title: "Informe o nome da impressora", variant: "destructive" }); return; }
    if (draft.connection_type === "network" && !draft.host?.trim()) {
      toast({ title: "Informe o IP da impressora de rede", variant: "destructive" }); return;
    }
    if (draft.connection_type === "usb" && !draft.usb_device_name?.trim()) {
      toast({ title: "Informe o nome USB no Windows", description: "Veja em Painel de Controle → Dispositivos e Impressoras", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload: any = {
      store_id: storeId,
      name: draft.name!.trim(),
      connection_type: draft.connection_type!,
      host: draft.connection_type === "network" ? draft.host!.trim() : null,
      port: draft.connection_type === "network" ? (draft.port ?? 9100) : null,
      usb_device_name: draft.connection_type === "usb" ? draft.usb_device_name!.trim() : null,
      printer_model: draft.printer_model ?? "bematech_mp4200",
      print_role: draft.print_role ?? "both",
      is_default: printers.length === 0, // primeira vira padrão
    };
    const { error } = await supabase.from("pdv_printers").insert(payload as never);
    setBusy(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Impressora cadastrada" });
    setAdding(false);
    setDraft({ name: "", connection_type: "usb", printer_model: "bematech_mp4200", print_role: "both", port: 9100 });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta impressora?")) return;
    setBusy(true);
    const { error } = await supabase.from("pdv_printers").delete().eq("id", id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Impressora removida" });
    void load();
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    // zera todas e marca a escolhida
    await supabase.from("pdv_printers").update({ is_default: false } as never).eq("store_id", storeId);
    const { error } = await supabase.from("pdv_printers").update({ is_default: true } as never).eq("id", id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    void load();
  };

  const toggleActive = async (p: PrinterRow) => {
    setBusy(true);
    const { error } = await supabase.from("pdv_printers").update({ is_active: !p.is_active } as never).eq("id", p.id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    void load();
  };

  const test = async (p: PrinterRow) => {
    // Se estiver no app desktop: usa ESC/POS real (corte automático + bipe).
    if (desktopOn) {
      setBusy(true);
      const res = await printViaElectron({
        connection_type: p.connection_type,
        host: p.host,
        port: p.port,
        usb_device_name: p.usb_device_name,
        printer_model: p.printer_model,
        content: {
          type: "test",
          data: {
            storeName,
            printerName: p.name,
            connection: p.connection_type === "network" ? `Rede ${p.host}:${p.port}` : `USB ${p.usb_device_name}`,
            role: ROLE_LABELS[p.print_role],
          },
        },
      });
      setBusy(false);
      if (res.ok) toast({ title: "Comando enviado", description: "Verifique o cupom impresso." });
      else toast({ title: "Falha na impressão", description: res.error, variant: "destructive" });
      return;
    }

    // Fallback navegador: HTML + window.print()
    toast({
      title: "Teste em modo navegador",
      description: "A impressão real ESC/POS estará disponível quando o app desktop for instalado.",
    });
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`
      <html><head><title>Teste impressora</title></head>
      <body style="font-family:monospace;padding:20px;">
        <h2 style="text-align:center;">TESTE DE IMPRESSÃO</h2>
        <p><strong>Loja:</strong> ${storeName}</p>
        <p><strong>Impressora:</strong> ${p.name}</p>
        <p><strong>Conexão:</strong> ${p.connection_type === "network" ? `Rede ${p.host}:${p.port}` : `USB ${p.usb_device_name}`}</p>
        <p><strong>Função:</strong> ${ROLE_LABELS[p.print_role]}</p>
        <hr/>
        <p>Se este texto saiu na impressora correta, o cadastro está OK.</p>
        <p style="text-align:center;margin-top:30px;">${new Date().toLocaleString("pt-BR")}</p>
        <script>window.print();</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="space-y-3">
      {desktopOn ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <p>
            <strong>App desktop Nexa Balcão detectado.</strong> Impressão ESC/POS direta (corte automático + bipe) ativa.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Impressão direta com corte automático (ESC/POS) requer o <strong>app desktop Nexa Balcão</strong>.
            O cadastro abaixo já fica salvo — quando o app for instalado nas lojas, ele passa a usar essas configurações automaticamente.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : printers.length === 0 && !adding ? (
        <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-md">
          Nenhuma impressora cadastrada nesta loja.
        </div>
      ) : (
        <div className="space-y-2">
          {printers.map((p) => (
            <div key={p.id} className={`rounded-md border p-3 ${p.is_active ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{p.name}</strong>
                    {p.is_default && <Badge variant="secondary" className="text-[10px]">Padrão</Badge>}
                    {!p.is_active && <Badge variant="outline" className="text-[10px]">Desativada</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {p.connection_type === "network" ? (
                      <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3" /> {p.host}:{p.port}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Usb className="h-3 w-3" /> {p.usb_device_name}</span>
                    )}
                    <span>·</span>
                    <span>{MODELS[p.printer_model] ?? p.printer_model}</span>
                    <span>·</span>
                    <span>{ROLE_LABELS[p.print_role]}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => test(p)} className="h-8 text-xs">
                    <Printer className="h-3 w-3 mr-1" /> Teste
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {!p.is_default && p.is_active && (
                  <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)} disabled={busy} className="h-7 text-xs">
                    Tornar padrão
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => toggleActive(p)} disabled={busy} className="h-7 text-xs">
                  {p.is_active ? "Desativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)} disabled={busy} className="h-7 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3 mr-1" /> Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="rounded-md border-2 border-primary/40 p-3 space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Nome (apelido)</label>
            <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ex: Bematech Balcão" className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Conexão</label>
              <Select value={draft.connection_type} onValueChange={(v) => setDraft({ ...draft, connection_type: v as any })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="network">Rede (WiFi/Ethernet)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Modelo</label>
              <Select value={draft.printer_model} onValueChange={(v) => setDraft({ ...draft, printer_model: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {draft.connection_type === "network" ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">IP da impressora</label>
                <Input value={draft.host ?? ""} onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                  placeholder="192.168.1.50" className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Porta</label>
                <Input type="number" value={draft.port ?? 9100} onChange={(e) => setDraft({ ...draft, port: parseInt(e.target.value) || 9100 })} className="h-9" />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Nome no Windows</label>
                {desktopOn && (
                  <Button type="button" size="sm" variant="ghost" onClick={detectUsb} disabled={scanning} className="h-6 text-[10px]">
                    {scanning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                    Detectar USB
                  </Button>
                )}
              </div>
              {systemPrinters.length > 0 ? (
                <Select value={draft.usb_device_name ?? ""} onValueChange={(v) => setDraft({ ...draft, usb_device_name: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {systemPrinters.map((sp) => (
                      <SelectItem key={sp.name} value={sp.name}>{sp.displayName || sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={draft.usb_device_name ?? ""} onChange={(e) => setDraft({ ...draft, usb_device_name: e.target.value })}
                  placeholder="Bematech MP-4200 TH" className="h-9" />
              )}
              <p className="text-[10px] text-muted-foreground">
                {desktopOn ? "Clique em 'Detectar USB' para listar impressoras instaladas." : "Ver em Painel de Controle → Dispositivos e Impressoras (use o nome exato)."}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Função</label>
            <Select value={draft.print_role} onValueChange={(v) => setDraft({ ...draft, print_role: v as any })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setAdding(false)} disabled={busy} className="flex-1">Cancelar</Button>
            <Button onClick={save} disabled={busy} className="flex-1">
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Adicionar impressora
        </Button>
      )}
    </div>
  );
}
