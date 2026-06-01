import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PiggyBank, ArrowDownCircle, ArrowUpCircle, Plus, Trash2, FileImage, RefreshCw, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Store { id: string; name: string }
interface Account { id: string; store_id: string; balance: number; is_active: boolean; store?: Store }
interface Movement {
  id: string; account_id: string; store_id: string;
  movement_type: "entrada" | "saida" | "ajuste";
  amount: number; occurred_at: string;
  description: string; category_id: string | null;
  receipt_url: string | null; receipt_number: string | null;
  supplier_name: string | null; source: string | null;
  created_by: string | null;
}
interface Category { id: string; name: string; kind: string; dre_group: string | null }

const fmtBRL = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PettyCash() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [supplier, setSupplier] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [source, setSource] = useState<string>("pix");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: accs, error: aErr }, { data: cats }] = await Promise.all([
      supabase
        .from("petty_cash_accounts")
        .select("id, store_id, balance, is_active, store:stores!inner(id, name, is_virtual, store_type)")
        .eq("stores.is_virtual", false)
        .neq("stores.store_type", "fabrica")
        .neq("stores.store_type", "central")
        .order("name", { foreignTable: "stores" }),
      supabase
        .from("finance_categories")
        .select("id, name, kind, dre_group")
        .in("kind", ["expense", "both"])
        .eq("is_active", true)
        .order("name"),
    ]);
    if (aErr) toast.error(aErr.message);
    setAccounts((accs ?? []) as unknown as Account[]);
    setCategories((cats ?? []) as Category[]);
    if (!selectedStoreId && accs && accs.length > 0) {
      setSelectedStoreId((accs[0] as any).store_id);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!selectedStoreId) { setMovements([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("petty_cash_movements")
        .select("*")
        .eq("store_id", selectedStoreId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) toast.error(error.message);
      setMovements((data ?? []) as Movement[]);
    })();
  }, [selectedStoreId]);

  const currentAccount = useMemo(
    () => accounts.find((a) => a.store_id === selectedStoreId),
    [accounts, selectedStoreId]
  );

  const totals = useMemo(() => {
    const entradas = movements.filter((m) => m.movement_type === "entrada").reduce((s, m) => s + Number(m.amount), 0);
    const saidas = movements.filter((m) => m.movement_type === "saida").reduce((s, m) => s + Number(m.amount), 0);
    return { entradas, saidas };
  }, [movements]);

  const resetForm = () => {
    setAmount(""); setDescription(""); setCategoryId("none");
    setSupplier(""); setReceiptNumber(""); setReceiptFile(null);
    setSource(type === "entrada" ? "pix" : "dinheiro");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openDialog = (t: "entrada" | "saida") => {
    setType(t);
    setSource(t === "entrada" ? "pix" : "dinheiro");
    setOpen(true);
  };

  const submit = async () => {
    if (!currentAccount) { toast.error("Selecione uma loja"); return; }
    const value = Number((amount || "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) { toast.error("Informe um valor maior que zero"); return; }
    if (!description.trim()) { toast.error("Informe uma descrição"); return; }
    if (type === "saida" && value > Number(currentAccount.balance)) {
      toast.error(`Saldo insuficiente. Disponível: ${fmtBRL(currentAccount.balance)}`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      let receiptUrl: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() ?? "bin";
        const path = `${currentAccount.store_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("petty-cash-receipts")
          .upload(path, receiptFile, { upsert: false, contentType: receiptFile.type || undefined });
        if (upErr) throw upErr;
        receiptUrl = path;
      }

      const { error } = await supabase.from("petty_cash_movements").insert({
        account_id: currentAccount.id,
        store_id: currentAccount.store_id,
        movement_type: type,
        amount: value,
        description: description.trim(),
        category_id: categoryId !== "none" ? categoryId : null,
        supplier_name: type === "saida" ? (supplier.trim() || null) : null,
        receipt_number: type === "saida" ? (receiptNumber.trim() || null) : null,
        receipt_url: receiptUrl,
        source,
        created_by: uid,
      });
      if (error) throw error;

      toast.success(`${type === "entrada" ? "Entrada" : "Saída"} de ${fmtBRL(value)} registrada`);
      setOpen(false);
      resetForm();
      await load();
      // recarregar movimentações
      const { data } = await supabase
        .from("petty_cash_movements").select("*")
        .eq("store_id", currentAccount.store_id)
        .order("occurred_at", { ascending: false }).limit(200);
      setMovements((data ?? []) as Movement[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao registrar");
    } finally {
      setSubmitting(false);
    }
  };

  const removeMovement = async (m: Movement) => {
    if (!isStaff) { toast.error("Apenas administradores/gerentes podem excluir."); return; }
    if (!confirm(`Excluir lançamento de ${fmtBRL(m.amount)}? O saldo será reajustado.`)) return;
    const { error } = await supabase.from("petty_cash_movements").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lançamento excluído");
    await load();
    setMovements((prev) => prev.filter((x) => x.id !== m.id));
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("petty-cash-receipts")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o cupom"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
            <PiggyBank className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Caixinha da loja
          </h1>
          <p className="text-muted-foreground text-sm">
            Controle pequenas compras e o dinheiro recebido por PIX em cada loja física.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {/* Seletor de loja */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <Filter className="h-4 w-4" /> Loja
          </CardDescription>
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.store_id}>
                  {a.store?.name ?? a.store_id} — saldo {fmtBRL(a.balance)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
      </Card>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo atual</CardDescription>
            <CardTitle className={`text-2xl ${currentAccount && Number(currentAccount.balance) < 0 ? "text-destructive" : "text-primary"}`}>
              {fmtBRL(Number(currentAccount?.balance ?? 0))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><ArrowDownCircle className="h-4 w-4 text-success" /> Entradas (últimos 200)</CardDescription>
            <CardTitle className="text-2xl text-success">{fmtBRL(totals.entradas)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><ArrowUpCircle className="h-4 w-4 text-destructive" /> Saídas (últimos 200)</CardDescription>
            <CardTitle className="text-2xl text-destructive">{fmtBRL(totals.saidas)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Ações */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button className="gap-2 flex-1 sm:flex-none" onClick={() => openDialog("entrada")} disabled={!selectedStoreId}>
          <ArrowDownCircle className="h-4 w-4" /> Registrar entrada (PIX/dinheiro)
        </Button>
        <Button variant="secondary" className="gap-2 flex-1 sm:flex-none" onClick={() => openDialog("saida")} disabled={!selectedStoreId}>
          <ArrowUpCircle className="h-4 w-4" /> Registrar compra
        </Button>
      </div>

      {/* Movimentações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações</CardTitle>
          <CardDescription>Últimos 200 lançamentos da loja selecionada.</CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem movimentações ainda.</p>
          ) : (
            <>
              {/* Cards no mobile */}
              <div className="sm:hidden space-y-2">
                {movements.map((m) => (
                  <div key={m.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant={m.movement_type === "entrada" ? "default" : "secondary"} className="gap-1">
                        {m.movement_type === "entrada" ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                        {m.movement_type}
                      </Badge>
                      <span className={`font-bold ${m.movement_type === "entrada" ? "text-success" : "text-destructive"}`}>
                        {m.movement_type === "entrada" ? "+" : "-"}{fmtBRL(m.amount)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{m.description}</p>
                    {m.supplier_name && <p className="text-xs text-muted-foreground">Fornecedor: {m.supplier_name}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">{new Date(m.occurred_at).toLocaleString("pt-BR")}</span>
                      <div className="flex gap-1">
                        {m.receipt_url && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openReceipt(m.receipt_url!)}>
                            <FileImage className="h-4 w-4" />
                          </Button>
                        )}
                        {isStaff && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeMovement(m)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Tabela no desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Cupom</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{new Date(m.occurred_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>
                          <Badge variant={m.movement_type === "entrada" ? "default" : "secondary"}>
                            {m.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate" title={m.description}>{m.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.supplier_name ?? "—"}</TableCell>
                        <TableCell>
                          {m.receipt_url ? (
                            <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openReceipt(m.receipt_url!)}>
                              <FileImage className="h-3.5 w-3.5" /> ver
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{m.receipt_number ?? "—"}</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${m.movement_type === "entrada" ? "text-success" : "text-destructive"}`}>
                          {m.movement_type === "entrada" ? "+" : "-"}{fmtBRL(m.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isStaff && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeMovement(m)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog de lançamento */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type === "entrada" ? <ArrowDownCircle className="h-5 w-5 text-success" /> : <ArrowUpCircle className="h-5 w-5 text-destructive" />}
              {type === "entrada" ? "Entrada na caixinha" : "Compra (saída)"}
            </DialogTitle>
            <DialogDescription>
              {type === "entrada"
                ? "Registre o valor recebido por PIX ou dinheiro."
                : "Registre o que foi comprado e anexe o cupom (opcional)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number" step="0.01" min={0} inputMode="decimal"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label>Origem</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Textarea
                rows={2} value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "entrada" ? "Ex: PIX recebido para caixinha" : "Ex: Sacolas, lâmpadas, troco etc."}
              />
            </div>

            {type === "saida" && (
              <>
                <div>
                  <Label>Categoria de despesa (DRE)</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem categoria —</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Fornecedor</Label>
                    <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome da loja" />
                  </div>
                  <div>
                    <Label>Nº cupom</Label>
                    <Input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="opcional" />
                  </div>
                </div>
                <div>
                  <Label>Foto/PDF do cupom (opcional)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
