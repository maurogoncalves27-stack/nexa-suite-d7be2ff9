import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Store { id: string; name: string }
interface DfeCompany {
  id: string;
  cnpj: string;
  environment: "homolog" | "producao";
  store_id: string | null;
  active: boolean;
  auto_ciencia: boolean;
  last_nsu: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSynced?: () => void;
}

export default function DfeConfigDialog({ open, onOpenChange, onSynced }: Props) {
  const [companies, setCompanies] = useState<DfeCompany[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [env, setEnv] = useState<"homolog" | "producao">("producao");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, sRes] = await Promise.all([
      supabase.from("dfe_companies").select("*").order("created_at"),
      supabase.from("stores").select("id, name").eq("is_virtual", false).eq("is_active", true).order("name"),
    ]);
    setCompanies((cRes.data as DfeCompany[]) ?? []);
    setStores((sRes.data as Store[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const add = async () => {
    if (!cnpj.trim()) return toast.error("Informe o CNPJ");
    setSubmitting(true);
    const { error } = await supabase.from("dfe_companies").insert({
      cnpj: cnpj.replace(/\D/g, ""),
      store_id: storeId || null,
      environment: env,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("CNPJ adicionado ao monitor DF-e");
    setCnpj(""); setStoreId(""); setEnv("producao");
    load();
  };

  const update = async (id: string, patch: Partial<DfeCompany>) => {
    const { error } = await supabase.from("dfe_companies").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este CNPJ do monitor?")) return;
    const { error } = await supabase.from("dfe_companies").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const syncNow = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("dfe-sync", { body: {} });
    setSyncing(false);
    if (error) return toast.error(error.message);
    const total = (data?.results ?? []).reduce((a: number, r: any) => a + (r.inserted ?? 0), 0);
    toast.success(`Sincronizado: ${total} nota(s) nova(s)`);
    onSynced?.();
    load();
  };

  const fmtCnpj = (v: string) => v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle>Configurar DF-e (Focus NFe)</DialogTitle>
              <DialogDescription>
                CNPJs monitorados para captura automática de notas recebidas na SEFAZ.
              </DialogDescription>
            </div>
            <Button size="sm" onClick={syncNow} disabled={syncing} className="gap-2 shrink-0">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar agora
            </Button>
          </div>
        </DialogHeader>

        <div className="rounded-lg border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <Label className="text-xs">Loja (opcional)</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Vincular loja" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ambiente</Label>
              <Select value={env} onValueChange={(v) => setEnv(v as any)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homolog">Homologação</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={add} disabled={submitting} className="gap-1">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum CNPJ monitorado.
            </p>
          ) : companies.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{fmtCnpj(c.cnpj)}</span>
                    <Badge variant={c.environment === "producao" ? "default" : "secondary"} className="text-[10px]">
                      {c.environment === "producao" ? "PROD" : "HOMOLOG"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.store_id ? (stores.find((s) => s.id === c.store_id)?.name ?? "—") : "Sem loja"}
                    {" • "}NSU {c.last_nsu}
                    {c.last_sync_at && (<> • sync {new Date(c.last_sync_at).toLocaleString("pt-BR")}</>)}
                  </p>
                  {c.last_sync_error && (
                    <p className="text-xs text-destructive mt-1">{c.last_sync_error}</p>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <Switch checked={c.active} onCheckedChange={(v) => update(c.id, { active: v })} />
                  <Label className="text-xs">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.auto_ciencia} onCheckedChange={(v) => update(c.id, { auto_ciencia: v })} />
                  <Label className="text-xs">Ciência automática</Label>
                </div>
                <Select value={c.environment} onValueChange={(v) => update(c.id, { environment: v as any })}>
                  <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homolog">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
