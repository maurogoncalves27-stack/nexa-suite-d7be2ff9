import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Plus, Pencil, Trash2, Loader2, Store, HelpCircle, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Dish = {
  id: string;
  marca: string;
  nome: string;
  descricao: string;
  tamanhos: string[];
  is_active: boolean;
  sort_order: number;
};

type Faq = {
  id: string;
  titulo: string;
  termos: string[];
  resposta: string;
  is_active: boolean;
  sort_order: number;
};

type GianaStore = {
  id: string;
  nome: string;
  endereco: string | null;
  horario: string | null;
  tem_salao: boolean;
  aceita_retirada: boolean;
  observacao: string | null;
  is_active: boolean;
  sort_order: number;
};

const MARCAS: Record<string, string> = {
  "aquela-parme": "Aquela Parmê",
  "aquele-estrogonofe": "Aquele Estrogonofe",
  "box-caipira": "Box Caipira",
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export default function GianaKnowledge({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [stores, setStores] = useState<GianaStore[]>([]);

  const [dishDraft, setDishDraft] = useState<Dish | null>(null);
  const [faqDraft, setFaqDraft] = useState<Faq | null>(null);
  const [storeDraft, setStoreDraft] = useState<GianaStore | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { table: "giana_dishes" | "giana_faq" | "giana_stores"; id: string; nome: string } | null
  >(null);

  const load = async () => {
    setLoading(true);
    const [d, f, s] = await Promise.all([
      supabase.from("giana_dishes").select("*").order("sort_order"),
      supabase.from("giana_faq").select("*").order("sort_order"),
      supabase.from("giana_stores").select("*").order("sort_order"),
    ]);
    if (d.error || f.error || s.error) {
      toast({
        title: "Erro ao carregar",
        description: (d.error ?? f.error ?? s.error)?.message,
        variant: "destructive",
      });
    }
    setDishes(((d.data ?? []) as unknown as Dish[]).map((x) => ({
      ...x, tamanhos: Array.isArray(x.tamanhos) ? x.tamanhos : [],
    })));
    setFaqs(((f.data ?? []) as unknown as Faq[]).map((x) => ({
      ...x, termos: Array.isArray(x.termos) ? x.termos : [],
    })));
    setStores((s.data ?? []) as unknown as GianaStore[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const nextOrder = (arr: { sort_order: number }[]) =>
    arr.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1;

  const saveDish = async () => {
    if (!dishDraft) return;
    if (!dishDraft.nome.trim() || !dishDraft.descricao.trim()) {
      toast({ title: "Preencha nome e descrição", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      id: dishDraft.id || slugify(dishDraft.nome),
      marca: dishDraft.marca,
      nome: dishDraft.nome.trim(),
      descricao: dishDraft.descricao.trim(),
      tamanhos: dishDraft.tamanhos,
      is_active: dishDraft.is_active,
      sort_order: dishDraft.sort_order,
    };
    const { error } = await supabase.from("giana_dishes").upsert(payload);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Prato salvo" });
    setDishDraft(null);
    load();
  };

  const saveFaq = async () => {
    if (!faqDraft) return;
    if (!faqDraft.titulo.trim() || !faqDraft.resposta.trim()) {
      toast({ title: "Preencha título e resposta", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      ...(faqDraft.id ? { id: faqDraft.id } : {}),
      titulo: faqDraft.titulo.trim(),
      termos: faqDraft.termos.map((t) => t.trim()).filter(Boolean),
      resposta: faqDraft.resposta.trim(),
      is_active: faqDraft.is_active,
      sort_order: faqDraft.sort_order,
    };
    const { error } = await supabase.from("giana_faq").upsert(payload);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Pergunta salva" });
    setFaqDraft(null);
    load();
  };

  const saveStore = async () => {
    if (!storeDraft) return;
    if (!storeDraft.nome.trim()) {
      toast({ title: "Informe o nome da loja", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      id: storeDraft.id || slugify(storeDraft.nome),
      nome: storeDraft.nome.trim(),
      endereco: storeDraft.endereco?.trim() || null,
      horario: storeDraft.horario?.trim() || null,
      tem_salao: storeDraft.tem_salao,
      aceita_retirada: storeDraft.aceita_retirada,
      observacao: storeDraft.observacao?.trim() || null,
      is_active: storeDraft.is_active,
      sort_order: storeDraft.sort_order,
    };
    const { error } = await supabase.from("giana_stores").upsert(payload);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Loja salva" });
    setStoreDraft(null);
    load();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from(confirmDelete.table).delete().eq("id", confirmDelete.id);
    setConfirmDelete(null);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    toast({ title: "Removido" });
    load();
  };

  const pendentes = useMemo(
    () => stores.filter((s) => s.is_active && (!s.endereco || !s.horario)).length,
    [stores],
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Base da Giana
          </h1>
          <p className="text-muted-foreground">
            Cardápio, perguntas frequentes e dados das lojas que a Giana usa para responder. O que não estiver aqui, ela não inventa — diz que vai confirmar com a equipe.
          </p>
        </div>
      )}


      {pendentes > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-4 text-sm">
            {pendentes} loja(s) sem endereço ou horário cadastrado — a Giana responde "vou confirmar com a equipe" nesses casos.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <Tabs defaultValue="dishes">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="dishes" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
              <Utensils className="h-4 w-4" /><span className="text-xs sm:text-sm">Pratos</span>
            </TabsTrigger>
            <TabsTrigger value="faq" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
              <HelpCircle className="h-4 w-4" /><span className="text-xs sm:text-sm">Perguntas</span>
            </TabsTrigger>
            <TabsTrigger value="stores" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
              <Store className="h-4 w-4" /><span className="text-xs sm:text-sm">Lojas</span>
            </TabsTrigger>
          </TabsList>

          {/* -------- Pratos (espelho do Cardápio) -------- */}
          <TabsContent value="dishes" className="mt-4 space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <span>
                Os pratos vêm automaticamente do <strong>Cardápio</strong> (itens ativos). Para
                incluir, editar ou remover, altere o cardápio.
              </span>
              <Button size="sm" variant="outline" asChild className="shrink-0">
                <Link to="/cardapio"><Utensils className="h-4 w-4 mr-1" /> Abrir cardápio</Link>
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {dishes.map((d) => (
                <Card key={d.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{d.nome}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground whitespace-pre-line line-clamp-4">{d.descricao}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{MARCAS[d.marca] ?? d.marca}</Badge>
                      {d.tamanhos.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!dishes.length && (
                <p className="text-sm text-muted-foreground">Nenhum item ativo no cardápio.</p>
              )}
            </div>
          </TabsContent>


          {/* -------- FAQ -------- */}
          <TabsContent value="faq" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setFaqDraft({
                id: "", titulo: "", termos: [], resposta: "",
                is_active: true, sort_order: nextOrder(faqs),
              })}>
                <Plus className="h-4 w-4 mr-1" /> Nova pergunta
              </Button>
            </div>
            <div className="space-y-3">
              {faqs.map((f) => (
                <Card key={f.id} className={f.is_active ? "" : "opacity-60"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-start justify-between gap-2">
                      <span>{f.titulo}</span>
                      <span className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => setFaqDraft(f)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost"
                          onClick={() => setConfirmDelete({ table: "giana_faq", id: f.id, nome: f.titulo })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground whitespace-pre-wrap">{f.resposta}</p>
                    <div className="flex flex-wrap gap-1">
                      {f.termos.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                      {!f.is_active && <Badge variant="destructive">inativo</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* -------- Lojas -------- */}
          <TabsContent value="stores" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setStoreDraft({
                id: "", nome: "", endereco: "", horario: "", tem_salao: false,
                aceita_retirada: true, observacao: "", is_active: true, sort_order: nextOrder(stores),
              })}>
                <Plus className="h-4 w-4 mr-1" /> Nova loja
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {stores.map((s) => (
                <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-start justify-between gap-2">
                      <span>{s.nome}</span>
                      <span className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => setStoreDraft(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost"
                          onClick={() => setConfirmDelete({ table: "giana_stores", id: s.id, nome: s.nome })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className={s.endereco ? "" : "text-muted-foreground italic"}>
                      {s.endereco || "Endereço não cadastrado"}
                    </p>
                    <p className={s.horario ? "" : "text-muted-foreground italic"}>
                      {s.horario || "Horário não cadastrado"}
                    </p>
                    {s.observacao && <p className="text-muted-foreground">{s.observacao}</p>}
                    <div className="flex flex-wrap gap-1">
                      {s.tem_salao && <Badge variant="secondary">salão</Badge>}
                      {s.aceita_retirada && <Badge variant="outline">retirada</Badge>}
                      {!s.is_active && <Badge variant="destructive">inativo</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* -------- Dialog prato -------- */}
      <Dialog open={!!dishDraft} onOpenChange={(o) => !o && setDishDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dishDraft?.id ? "Editar prato" : "Novo prato"}</DialogTitle></DialogHeader>
          {dishDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Select value={dishDraft.marca} onValueChange={(v) => setDishDraft({ ...dishDraft, marca: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MARCAS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={dishDraft.nome} onChange={(e) => setDishDraft({ ...dishDraft, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={dishDraft.descricao}
                  onChange={(e) => setDishDraft({ ...dishDraft, descricao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tamanhos de parmegiana</Label>
                <div className="flex flex-wrap gap-3">
                  {["individual", "casal", "familia"].map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={dishDraft.tamanhos.includes(t)}
                        onCheckedChange={(c) => setDishDraft({
                          ...dishDraft,
                          tamanhos: c
                            ? [...dishDraft.tamanhos, t]
                            : dishDraft.tamanhos.filter((x) => x !== t),
                        })}
                      />
                      {t}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Os pesos (600g / 1200g / 2400g) são fixos no sistema e não mudam por aqui.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={dishDraft.is_active}
                  onCheckedChange={(c) => setDishDraft({ ...dishDraft, is_active: c })} />
                Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDishDraft(null)}>Cancelar</Button>
            <Button onClick={saveDish} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- Dialog FAQ -------- */}
      <Dialog open={!!faqDraft} onOpenChange={(o) => !o && setFaqDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{faqDraft?.id ? "Editar pergunta" : "Nova pergunta"}</DialogTitle></DialogHeader>
          {faqDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={faqDraft.titulo} onChange={(e) => setFaqDraft({ ...faqDraft, titulo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Termos que o cliente pode usar (separados por vírgula)</Label>
                <Input value={faqDraft.termos.join(", ")}
                  onChange={(e) => setFaqDraft({ ...faqDraft, termos: e.target.value.split(",") })} />
                <p className="text-xs text-muted-foreground">
                  Escreva sem acento e em minúsculo: sem gluten, celiaco…
                </p>
              </div>
              <div className="space-y-2">
                <Label>Resposta oficial</Label>
                <Textarea rows={5} value={faqDraft.resposta}
                  onChange={(e) => setFaqDraft({ ...faqDraft, resposta: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={faqDraft.is_active}
                  onCheckedChange={(c) => setFaqDraft({ ...faqDraft, is_active: c })} />
                Ativa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaqDraft(null)}>Cancelar</Button>
            <Button onClick={saveFaq} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- Dialog loja -------- */}
      <Dialog open={!!storeDraft} onOpenChange={(o) => !o && setStoreDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{storeDraft?.id ? "Editar loja" : "Nova loja"}</DialogTitle></DialogHeader>
          {storeDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={storeDraft.nome} onChange={(e) => setStoreDraft({ ...storeDraft, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Endereço completo</Label>
                <Textarea value={storeDraft.endereco ?? ""}
                  onChange={(e) => setStoreDraft({ ...storeDraft, endereco: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Horário de funcionamento</Label>
                <Textarea value={storeDraft.horario ?? ""}
                  placeholder="Ex.: Seg a Dom, 11h às 22h"
                  onChange={(e) => setStoreDraft({ ...storeDraft, horario: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Observação para a Giana</Label>
                <Textarea value={storeDraft.observacao ?? ""}
                  onChange={(e) => setStoreDraft({ ...storeDraft, observacao: e.target.value })} />
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={storeDraft.tem_salao}
                    onCheckedChange={(c) => setStoreDraft({ ...storeDraft, tem_salao: c })} />
                  Tem salão (aceita reserva de mesa)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={storeDraft.aceita_retirada}
                    onCheckedChange={(c) => setStoreDraft({ ...storeDraft, aceita_retirada: c })} />
                  Aceita retirada no balcão
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={storeDraft.is_active}
                    onCheckedChange={(c) => setStoreDraft({ ...storeDraft, is_active: c })} />
                  Ativa
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreDraft(null)}>Cancelar</Button>
            <Button onClick={saveStore} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{confirmDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A Giana deixa de usar esse conteúdo nas respostas. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
