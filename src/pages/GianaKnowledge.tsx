import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Plus, Pencil, Trash2, Loader2, Store, HelpCircle, Utensils, Tag } from "lucide-react";
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
  serves_people?: number | null;
  total_weight_g?: number | null;
  protein_weight_g?: number | null;

};

type Brand = {
  id: string;
  nome: string;
  slogan: string | null;
  descricao: string | null;
  historia: string | null;
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandDraft, setBrandDraft] = useState<Brand | null>(null);

  const [faqDraft, setFaqDraft] = useState<Faq | null>(null);
  const [storeDraft, setStoreDraft] = useState<GianaStore | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { table: "giana_faq" | "giana_stores" | "giana_brands"; id: string; nome: string } | null
  >(null);

  const load = async () => {
    setLoading(true);
    const [d, f, s, b] = await Promise.all([
      supabase.from("giana_menu_dishes").select("*").order("sort_order"),
      supabase.from("giana_faq").select("*").order("sort_order"),
      supabase.from("giana_stores").select("*").order("sort_order"),
      supabase.from("giana_brands").select("*").order("sort_order"),
    ]);
    if (d.error || f.error || s.error || b.error) {
      toast({
        title: "Erro ao carregar",
        description: (d.error ?? f.error ?? s.error ?? b.error)?.message,
        variant: "destructive",
      });
    }
    setBrands((b.data ?? []) as unknown as Brand[]);
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



  const saveBrand = async () => {
    if (!brandDraft) return;
    if (!brandDraft.nome.trim()) {
      toast({ title: "Informe o nome da marca", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("giana_brands").upsert({
      id: brandDraft.id || slugify(brandDraft.nome),
      nome: brandDraft.nome.trim(),
      slogan: brandDraft.slogan?.trim() || null,
      descricao: brandDraft.descricao?.trim() || null,
      historia: brandDraft.historia?.trim() || null,
      is_active: brandDraft.is_active,
      sort_order: brandDraft.sort_order,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Marca salva" });
    setBrandDraft(null);
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

  const dishesByBrand = useMemo(() => {
    const order = brands.length
      ? brands.map((b) => b.id)
      : Object.keys(MARCAS);
    const groups = new Map<string, Dish[]>();
    for (const d of dishes) {
      const k = d.marca || "outros";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(d);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99),
    );
  }, [dishes, brands]);

  const brandLabel = (id: string) =>
    brands.find((b) => b.id === id)?.nome ?? MARCAS[id] ?? id;

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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="dishes" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
              <Utensils className="h-4 w-4" /><span className="text-xs sm:text-sm">Pratos</span>
            </TabsTrigger>
            <TabsTrigger value="brands" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
              <Tag className="h-4 w-4" /><span className="text-xs sm:text-sm">Marcas</span>
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
            {dishesByBrand.map(([marca, list]) => (
              <div key={marca} className="space-y-2">
                <div className="flex items-center gap-2 pt-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{brandLabel(marca)}</h3>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((d) => (
                    <Card key={d.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{d.nome}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <p className="text-muted-foreground whitespace-pre-line line-clamp-4">{d.descricao}</p>
                        <div className="flex flex-wrap gap-1">
                          {d.tamanhos.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {d.serves_people != null && (
                            <Badge variant="outline">Serve {d.serves_people} pessoa(s)</Badge>
                          )}
                          {d.total_weight_g != null && (
                            <Badge variant="outline">Total {d.total_weight_g}g</Badge>
                          )}
                          {d.protein_weight_g != null && (
                            <Badge variant="outline">Proteína {d.protein_weight_g}g</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {!dishes.length && (
              <p className="text-sm text-muted-foreground">Nenhum item ativo no cardápio.</p>
            )}
          </TabsContent>


          {/* -------- Marcas -------- */}
          <TabsContent value="brands" className="mt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Conte a história e o posicionamento de cada marca. A Giana usa esse texto quando o
                cliente pergunta "o que é a Aquela Parmê?" ou pede recomendação de marca.
              </p>
              <Button size="sm" className="shrink-0" onClick={() => setBrandDraft({
                id: "", nome: "", slogan: "", descricao: "", historia: "",
                is_active: true, sort_order: nextOrder(brands),
              })}>
                <Plus className="h-4 w-4 mr-1" /> Nova marca
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {brands.map((b) => (
                <Card key={b.id} className={b.is_active ? "" : "opacity-60"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-start justify-between gap-2">
                      <span>{b.nome}</span>
                      <span className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => setBrandDraft(b)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost"
                          onClick={() => setConfirmDelete({ table: "giana_brands", id: b.id, nome: b.nome })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {b.slogan && <p className="italic text-muted-foreground">"{b.slogan}"</p>}
                    <p className={b.descricao ? "whitespace-pre-wrap" : "text-muted-foreground italic"}>
                      {b.descricao || "Sem descrição cadastrada"}
                    </p>
                    {b.historia && (
                      <p className="text-muted-foreground whitespace-pre-wrap line-clamp-6">{b.historia}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">
                        {dishes.filter((d) => d.marca === b.id).length} prato(s)
                      </Badge>
                      {!b.is_active && <Badge variant="destructive">inativa</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!brands.length && (
                <p className="text-sm text-muted-foreground">Nenhuma marca cadastrada.</p>
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


      {/* -------- Dialog marca -------- */}
      <Dialog open={!!brandDraft} onOpenChange={(o) => !o && setBrandDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{brandDraft?.id ? "Editar marca" : "Nova marca"}</DialogTitle></DialogHeader>
          {brandDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={brandDraft.nome}
                  onChange={(e) => setBrandDraft({ ...brandDraft, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slogan (opcional)</Label>
                <Input value={brandDraft.slogan ?? ""}
                  onChange={(e) => setBrandDraft({ ...brandDraft, slogan: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição / posicionamento</Label>
                <Textarea rows={4} value={brandDraft.descricao ?? ""}
                  placeholder="O que a marca vende, para quem, o que a diferencia."
                  onChange={(e) => setBrandDraft({ ...brandDraft, descricao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>História da marca</Label>
                <Textarea rows={6} value={brandDraft.historia ?? ""}
                  placeholder="Como surgiu, marcos importantes, curiosidades que a Giana pode contar."
                  onChange={(e) => setBrandDraft({ ...brandDraft, historia: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={brandDraft.is_active}
                  onCheckedChange={(c) => setBrandDraft({ ...brandDraft, is_active: c })} />
                Ativa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandDraft(null)}>Cancelar</Button>
            <Button onClick={saveBrand} disabled={saving}>
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
