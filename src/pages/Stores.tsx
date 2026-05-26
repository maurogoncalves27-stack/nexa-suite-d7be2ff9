import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Building2, Loader2, Pencil, Trash2, Network, MapPin, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

interface Store {
  id: string;
  name: string;
  code: string | null;
  cnpj: string | null;
  legal_name: string | null;
  brand: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  manager_name: string | null;
  is_active: boolean;
  parent_store_id: string | null;
  is_virtual: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  store_type: "loja" | "fabrica" | "central";
}

const NONE = "__none__";

// Valida CNPJ (14 dígitos + dígitos verificadores)
const isValidCNPJ = (raw: string) => {
  const cnpj = raw.replace(/\D/g, "");
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
};

const formatCNPJ = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const formatCEP = (raw: string) => {
  const d = onlyDigits(raw).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
};

const storeSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(100),
  cnpj: z.string().trim().max(20).optional().nullable(),
  legal_name: z.string().trim().max(150).optional().nullable(),
  brand: z.string().trim().max(100).optional().nullable(),
  code: z.string().trim().max(20).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  zip_code: z.string().trim().max(10).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  manager_name: z.string().trim().max(100).optional().nullable(),
  parent_store_id: z.string().uuid().optional().nullable().or(z.literal("")),
  latitude: z.string().trim().optional().nullable(),
  longitude: z.string().trim().optional().nullable(),
  geofence_radius_m: z.string().trim().optional().nullable(),
});

export default function Stores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const [parentChoice, setParentChoice] = useState<string>(NONE);
  const [isVirtualMode, setIsVirtualMode] = useState(false);
  const [cnpjValue, setCnpjValue] = useState<string>("");
  const [cepValue, setCepValue] = useState<string>("");
  const [cityValue, setCityValue] = useState<string>("");
  const [stateValue, setStateValue] = useState<string>("");
  const [latValue, setLatValue] = useState<string>("");
  const [lngValue, setLngValue] = useState<string>("");
  const [radiusValue, setRadiusValue] = useState<string>("200");
  const [capturingGps, setCapturingGps] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [storeTypeValue, setStoreTypeValue] = useState<"loja" | "fabrica" | "central">("loja");

  // Busca endereço (ViaCEP) + coordenadas (Nominatim) a partir do CEP
  const lookupCep = async (rawCep: string) => {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) {
      toast({ title: "CEP inválido", description: "Informe os 8 dígitos do CEP.", variant: "destructive" });
      return;
    }
    setLookingUpCep(true);
    try {
      const viaRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const via = await viaRes.json();
      if (via?.erro) {
        toast({ title: "CEP não encontrado", variant: "destructive" });
        return;
      }
      if (via.localidade) setCityValue(via.localidade);
      if (via.uf) setStateValue(via.uf);

      const q = encodeURIComponent(
        [via.logradouro, via.bairro, via.localidade, via.uf, cep, "Brasil"].filter(Boolean).join(", ")
      );
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const nom = await nomRes.json();
      if (Array.isArray(nom) && nom.length > 0) {
        setLatValue(parseFloat(nom[0].lat).toFixed(7));
        setLngValue(parseFloat(nom[0].lon).toFixed(7));
        toast({
          title: "Endereço e coordenadas preenchidos",
          description: `${via.localidade}/${via.uf}${via.logradouro ? " · " + via.logradouro : ""}`,
        });
      } else {
        toast({
          title: "Endereço encontrado, mas sem coordenadas precisas",
          description: "Use 'Usar localização atual' estando na loja para maior precisão.",
        });
      }
    } catch (e: any) {
      toast({ title: "Erro ao buscar CEP", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setLookingUpCep(false);
    }
  };

  const captureCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS indisponível", description: "Seu navegador não suporta geolocalização.", variant: "destructive" });
      return;
    }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatValue(pos.coords.latitude.toFixed(7));
        setLngValue(pos.coords.longitude.toFixed(7));
        setCapturingGps(false);
        toast({ title: "Localização capturada", description: `Precisão: ${Math.round(pos.coords.accuracy)}m` });
      },
      (err) => {
        setCapturingGps(false);
        toast({ title: "Erro ao capturar GPS", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("stores").select("*").order("name");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setStores((data ?? []) as Store[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Lojas elegíveis a serem mãe:
  // - Para loja virtual: qualquer loja não-virtual (matriz ou filial)
  // - Para loja física: apenas lojas que NÃO são filiais (matriz)
  const eligibleParents = stores.filter((s) => {
    if (editing && s.id === editing.id) return false;
    if (s.is_virtual) return false;
    if (isVirtualMode) return true; // virtual pode pendurar em qualquer física
    return !s.parent_store_id; // física só pode ser filial de matriz
  });
  // Map para mostrar o nome da mãe na tabela
  const storeNameById = Object.fromEntries(stores.map((s) => [s.id, s.name]));
  // Conta filiais físicas e virtuais por loja-mãe
  const branchesCount: Record<string, number> = {};
  const virtualsCount: Record<string, number> = {};
  // Lista de marcas (nomes de lojas virtuais) por loja-mãe
  const virtualBrandsByParent: Record<string, string[]> = {};
  stores.forEach((s) => {
    if (!s.parent_store_id) return;
    if (s.is_virtual) {
      virtualsCount[s.parent_store_id] = (virtualsCount[s.parent_store_id] ?? 0) + 1;
      if (!virtualBrandsByParent[s.parent_store_id]) virtualBrandsByParent[s.parent_store_id] = [];
      virtualBrandsByParent[s.parent_store_id].push(s.name);
    } else {
      branchesCount[s.parent_store_id] = (branchesCount[s.parent_store_id] ?? 0) + 1;
    }
  });

  // Retorna todas as marcas de uma loja física: campo `brand` + nomes de marcas vinculadas
  const getStoreBrands = (s: Store): string[] => {
    const set = new Set<string>();
    if (s.brand) set.add(s.brand);
    (virtualBrandsByParent[s.id] ?? []).forEach((n) => set.add(n));
    return Array.from(set);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const editingIsVirtual = editing?.is_virtual ?? isVirtualMode;

    if (editingIsVirtual && (!parentChoice || parentChoice === NONE)) {
      toast({
        title: "Loja física obrigatória",
        description: "Selecione a loja física à qual esta marca será vinculada.",
        variant: "destructive",
      });
      return;
    }

    const parsed = storeSchema.safeParse({
      name: form.get("name"),
      cnpj: cnpjValue,
      legal_name: form.get("legal_name") ?? "",
      brand: form.get("brand") ?? "",
      code: form.get("code"),
      city: cityValue,
      state: stateValue,
      zip_code: cepValue,
      phone: form.get("phone"),
      manager_name: form.get("manager_name"),
      parent_store_id: parentChoice === NONE ? "" : parentChoice,
      latitude: latValue,
      longitude: lngValue,
      geofence_radius_m: radiusValue,
    });
    if (!parsed.success) {
      const err = parsed.error.errors[0];
      toast({
        title: "Dados inválidos",
        description: `${err.path.join(".") || "campo"}: ${err.message}`,
        variant: "destructive",
      });
      return;
    }
    if (parsed.data.cnpj && !isValidCNPJ(parsed.data.cnpj)) {
      toast({ title: "CNPJ inválido", variant: "destructive" });
      return;
    }
    if (!editingIsVirtual && !parsed.data.legal_name) {
      toast({ title: "Razão social obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Loja virtual: herda endereço/geofence/gestor da mãe automaticamente
    type StorePayload = {
      name: string;
      cnpj: string | null;
      legal_name: string;
      brand: string | null;
      code: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
      phone: string | null;
      manager_name: string | null;
      parent_store_id: string | null;
      latitude: number | null;
      longitude: number | null;
      geofence_radius_m: number;
      is_virtual: boolean;
      store_type: "loja" | "fabrica" | "central";
    };

    const cnpjDigits = (parsed.data.cnpj ?? "").replace(/\D/g, "") || null;

    let payload: StorePayload;
    if (editingIsVirtual) {
      const parent = stores.find((s) => s.id === parsed.data.parent_store_id);
      payload = {
        name: parsed.data.name,
        cnpj: cnpjDigits,
        legal_name: parent?.legal_name ?? parsed.data.name,
        brand: parsed.data.brand || null,
        code: parsed.data.code || null,
        phone: parent?.phone ?? null,
        manager_name: parent?.manager_name ?? null,
        city: parent?.city ?? null,
        state: parent?.state ?? null,
        zip_code: parent?.zip_code ?? null,
        latitude: parent?.latitude ?? null,
        longitude: parent?.longitude ?? null,
        geofence_radius_m: parent?.geofence_radius_m ?? 200,
        parent_store_id: parsed.data.parent_store_id || null,
        is_virtual: true,
        store_type: storeTypeValue,
      };
    } else {
      const latNum = parsed.data.latitude ? parseFloat(parsed.data.latitude) : null;
      const lngNum = parsed.data.longitude ? parseFloat(parsed.data.longitude) : null;
      const radNum = parsed.data.geofence_radius_m ? parseInt(parsed.data.geofence_radius_m, 10) : 200;
      payload = {
        name: parsed.data.name,
        cnpj: cnpjDigits,
        legal_name: parsed.data.legal_name || "",
        brand: parsed.data.brand || null,
        code: parsed.data.code || null,
        city: parsed.data.city || null,
        state: parsed.data.state || null,
        zip_code: parsed.data.zip_code ? onlyDigits(parsed.data.zip_code) : null,
        phone: parsed.data.phone || null,
        manager_name: parsed.data.manager_name || null,
        parent_store_id: parsed.data.parent_store_id || null,
        latitude: latNum != null && !isNaN(latNum) ? latNum : null,
        longitude: lngNum != null && !isNaN(lngNum) ? lngNum : null,
        geofence_radius_m: !isNaN(radNum) && radNum > 0 ? radNum : 200,
        is_virtual: false,
        store_type: storeTypeValue,
      };
    }

    const { error } = editing
      ? await supabase.from("stores").update(payload).eq("id", editing.id)
      : await supabase.from("stores").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Loja atualizada" : "Loja criada" });
    setOpen(false);
    setEditing(null);
    setParentChoice(NONE);
    setIsVirtualMode(false);
    setCnpjValue("");
    setCepValue("");
    setCityValue("");
    setStateValue("");
    setLatValue("");
    setLngValue("");
    setRadiusValue("200");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta loja? Esta ação não pode ser desfeita.")) return;
    const { error, count } = await supabase
      .from("stores")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    if (!count) {
      toast({
        title: "Sem permissão",
        description: "Você não tem permissão para excluir esta loja. Apenas administradores podem excluir lojas.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Loja excluída" });
    load();
  };

  const openNew = () => {
    setEditing(null);
    setIsVirtualMode(false);
    setParentChoice(NONE);
    setCnpjValue("");
    setCepValue("");
    setCityValue("");
    setStateValue("");
    setLatValue("");
    setLngValue("");
    setRadiusValue("200");
    setStoreTypeValue("loja");
    setOpen(true);
  };
  const openNewVirtual = (parentId?: string) => {
    setEditing(null);
    setIsVirtualMode(true);
    setParentChoice(parentId ?? NONE);
    setCnpjValue("");
    setCepValue("");
    setCityValue("");
    setStateValue("");
    setLatValue("");
    setLngValue("");
    setRadiusValue("200");
    setStoreTypeValue("loja");
    setOpen(true);
  };
  const openEdit = (s: Store) => {
    setEditing(s);
    setIsVirtualMode(s.is_virtual);
    setParentChoice(s.parent_store_id ?? NONE);
    setCnpjValue(s.cnpj ? formatCNPJ(s.cnpj) : "");
    setCepValue(s.zip_code ? formatCEP(s.zip_code) : "");
    setCityValue(s.city ?? "");
    setStateValue(s.state ?? "");
    setLatValue(s.latitude != null ? String(s.latitude) : "");
    setLngValue(s.longitude != null ? String(s.longitude) : "");
    setRadiusValue(s.geofence_radius_m != null ? String(s.geofence_radius_m) : "200");
    setStoreTypeValue(s.store_type ?? "loja");
    setOpen(true);
  };

  const editingHasChildren = editing
    ? (branchesCount[editing.id] ?? 0) + (virtualsCount[editing.id] ?? 0) > 0
    : false;
  const isEditingMatriz = editing && !editing.is_virtual && (branchesCount[editing.id] ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" /> Lojas
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie as unidades da sua rede e suas marcas (CNPJ próprio, mesmo endereço)
          </p>
        </div>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setIsVirtualMode(false); } }}>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Botão "Nova marca" removido — criar marca a partir da loja física */}
            <DialogTrigger asChild>
              <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4" /> Nova loja</Button>
            </DialogTrigger>
          </div>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? (editing.is_virtual ? "Editar marca" : "Editar loja")
                  : (isVirtualMode ? "Nova marca" : "Nova loja")}
              </DialogTitle>
              <DialogDescription>
                {(editing?.is_virtual ?? isVirtualMode)
                  ? "Marca com CNPJ e nome próprios, vinculada a uma loja física existente. Endereço, gestor e cerca virtual são herdados da loja física."
                  : "Cadastre uma unidade da rede"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="name">
                    {(editing?.is_virtual ?? isVirtualMode) ? "Nome da marca*" : "Nome fantasia*"}
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editing?.name ?? ""}
                    placeholder={(editing?.is_virtual ?? isVirtualMode) ? "Ex: Pizza Hut" : ""}
                    required
                  />
                </div>
                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <div className="sm:col-span-2 space-y-2">
                    <Label htmlFor="legal_name">Razão social*</Label>
                    <Input
                      id="legal_name"
                      name="legal_name"
                      defaultValue={editing?.legal_name ?? ""}
                      required
                    />
                  </div>
                )}
                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Tipo de unidade*</Label>
                    <Select value={storeTypeValue} onValueChange={(v) => setStoreTypeValue(v as "loja" | "fabrica" | "central")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="loja">Loja (PDV / atendimento)</SelectItem>
                        <SelectItem value="fabrica">Fábrica (produção)</SelectItem>
                        <SelectItem value="central">Estoque central (distribuição)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      <b>Loja</b>: ponto de venda. <b>Fábrica</b>: produz e envia ao central. <b>Central</b>: recebe da fábrica/compras e distribui (apenas 1 permitido).
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    name="cnpj"
                    value={cnpjValue}
                    onChange={(e) => setCnpjValue(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </div>
                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <div className="space-y-2">
                    <Label htmlFor="brand">Marca</Label>
                    <Input
                      id="brand"
                      name="brand"
                      defaultValue={editing?.brand ?? ""}
                      placeholder="Ex: Pizza Hut"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" name="code" defaultValue={editing?.code ?? ""} placeholder="LOJ-01" />
                </div>
                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
                  </div>
                )}
                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <>
                    <div className="sm:col-span-2 space-y-2">
                      <Label htmlFor="zip_code">CEP</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="zip_code"
                          value={cepValue}
                          onChange={(e) => setCepValue(formatCEP(e.target.value))}
                          onBlur={(e) => {
                            const d = onlyDigits(e.target.value);
                            if (d.length === 8) lookupCep(d);
                          }}
                          placeholder="00000-000"
                          inputMode="numeric"
                          maxLength={9}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => lookupCep(cepValue)}
                          disabled={lookingUpCep || onlyDigits(cepValue).length !== 8}
                          className="w-full sm:w-auto shrink-0"
                        >
                          {lookingUpCep ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                          Buscar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ao informar o CEP, cidade, UF e coordenadas (latitude/longitude) são preenchidos automaticamente.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input id="city" name="city" value={cityValue} onChange={(e) => setCityValue(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">UF</Label>
                      <Input id="state" name="state" maxLength={2} value={stateValue} onChange={(e) => setStateValue(e.target.value.toUpperCase())} />
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <Label htmlFor="manager_name">Gestor responsável</Label>
                      <Input id="manager_name" name="manager_name" defaultValue={editing?.manager_name ?? ""} />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2 space-y-2">
                  <Label>
                    {(editing?.is_virtual ?? isVirtualMode) ? "Loja física vinculada*" : "Loja matriz"}
                  </Label>
                  <Select
                    value={parentChoice}
                    onValueChange={setParentChoice}
                    disabled={isEditingMatriz}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {!(editing?.is_virtual ?? isVirtualMode) && (
                        <SelectItem value={NONE}>Nenhuma (esta loja é matriz)</SelectItem>
                      )}
                      {eligibleParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.parent_store_id ? " (filial)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {(editing?.is_virtual ?? isVirtualMode)
                      ? "A marca herda endereço, gestor e cerca virtual da loja física selecionada. Apenas o nome, CNPJ e cardápio são próprios."
                      : isEditingMatriz
                        ? "Esta loja já é matriz de outras filiais. Remova as filiais antes de torná-la subordinada."
                        : "Deixe em branco para cadastrar uma matriz. Para criar uma filial, selecione a matriz correspondente."}
                  </p>
                </div>

                {!(editing?.is_virtual ?? isVirtualMode) && (
                  <div className="sm:col-span-2 border-t pt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" /> Cerca virtual (geofence)
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Define a área onde o colaborador pode bater o ponto. Batidas fora da área serão sinalizadas para o RH.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={captureCurrentLocation}
                        disabled={capturingGps}
                        className="w-full sm:w-auto"
                      >
                        {capturingGps ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                        Usar localização atual
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="latitude">Latitude</Label>
                        <Input
                          id="latitude"
                          value={latValue}
                          onChange={(e) => setLatValue(e.target.value)}
                          placeholder="-23.5505199"
                          inputMode="decimal"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="longitude">Longitude</Label>
                        <Input
                          id="longitude"
                          value={lngValue}
                          onChange={(e) => setLngValue(e.target.value)}
                          placeholder="-46.6333094"
                          inputMode="decimal"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="geofence_radius_m">Raio (metros)</Label>
                        <Input
                          id="geofence_radius_m"
                          value={radiusValue}
                          onChange={(e) => setRadiusValue(e.target.value)}
                          placeholder="200"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dica: vá até a loja e clique em "Usar localização atual" para preencher automaticamente. Raio recomendado: 200m.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : stores.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhuma loja cadastrada ainda.
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="sm:hidden divide-y">
                {stores.filter((s) => !s.is_virtual).map((s) => {
                  const isFilial = !!s.parent_store_id && !s.is_virtual;
                  const isVirtual = s.is_virtual;
                  const branches = branchesCount[s.id] ?? 0;
                  const virtuals = virtualsCount[s.id] ?? 0;
                  return (
                    <div key={s.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-semibold truncate">
                            {isVirtual ? (
                              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : isFilial ? (
                              <Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : null}
                            <span className="truncate">{s.name}</span>
                          </div>
                          {s.legal_name && (
                            <div className="text-xs text-muted-foreground truncate">{s.legal_name}</div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!isVirtual && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openNewVirtual(s.id)}
                              title="Adicionar marca"
                            >
                              <Tag className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.store_type === "fabrica" && (
                          <Badge variant="outline" className="text-xs border-primary text-primary">Fábrica</Badge>
                        )}
                        {s.store_type === "central" && (
                          <Badge variant="default" className="text-xs">Central</Badge>
                        )}
                        {isVirtual ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Tag className="h-3 w-3" /> Marca
                          </Badge>
                        ) : isFilial ? (
                          <Badge variant="secondary" className="text-xs">
                            Filial{virtuals > 0 ? ` · ${virtuals} marca${virtuals > 1 ? "s" : ""}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            Matriz
                            {branches > 0 ? ` · ${branches} filia${branches > 1 ? "is" : "l"}` : ""}
                            {virtuals > 0 ? ` · ${virtuals} marca${virtuals > 1 ? "s" : ""}` : ""}
                          </Badge>
                        )}
                        <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs">
                          {s.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                        {s.code && <Badge variant="outline" className="text-xs">{s.code}</Badge>}
                      </div>
                      {!isVirtual && getStoreBrands(s).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {getStoreBrands(s).map((b) => (
                            <Badge key={b} variant="outline" className="text-xs gap-1 font-normal">
                              <Tag className="h-3 w-3" /> {b}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {s.cnpj && <div className="font-mono">{formatCNPJ(s.cnpj)}</div>}
                        {!isVirtual && (s.city || s.state) && <div>{[s.city, s.state].filter(Boolean).join("/")}</div>}
                        {!isVirtual && s.manager_name && <div>Gestor: {s.manager_name}</div>}
                        {(isFilial || isVirtual) && (
                          <div>
                            {isVirtual ? "Marca da loja " : "Subordinada a "}
                            {storeNameById[s.parent_store_id!] ?? "—"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Gestor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.filter((s) => !s.is_virtual).map((s) => {
                      const isFilial = !!s.parent_store_id && !s.is_virtual;
                      const isVirtual = s.is_virtual;
                      const branches = branchesCount[s.id] ?? 0;
                      const virtuals = virtualsCount[s.id] ?? 0;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isVirtual ? (
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : isFilial ? (
                                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              {s.name}
                              {!isVirtual && !isFilial && (
                                <Badge variant="default" className="text-[10px] py-0 px-1.5 h-4">Matriz</Badge>
                              )}
                              {isFilial && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">Filial</Badge>
                              )}
                              {s.store_type === "fabrica" && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-primary text-primary">Fábrica</Badge>
                              )}
                              {s.store_type === "central" && (
                                <Badge variant="default" className="text-[10px] py-0 px-1.5 h-4">Central</Badge>
                              )}
                            </div>
                            {s.legal_name && (
                              <div className="text-xs text-muted-foreground">{s.legal_name}</div>
                            )}
                            {(isFilial || isVirtual) && (
                              <div className="text-xs text-muted-foreground">
                                {isVirtual ? "Marca da loja " : "Subordinada a "}
                                {storeNameById[s.parent_store_id!] ?? "—"}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {s.cnpj ? formatCNPJ(s.cnpj) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isVirtual ? (
                              s.name
                            ) : (
                              (() => {
                                const brands = getStoreBrands(s);
                                if (brands.length === 0) return "—";
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {brands.map((b) => (
                                      <Badge key={b} variant="outline" className="gap-1 font-normal">
                                        <Tag className="h-3 w-3" /> {b}
                                      </Badge>
                                    ))}
                                  </div>
                                );
                              })()
                            )}
                          </TableCell>
                          <TableCell>{s.code ?? "—"}</TableCell>
                          <TableCell>{isVirtual ? "—" : ([s.city, s.state].filter(Boolean).join("/") || "—")}</TableCell>
                          <TableCell>{isVirtual ? "—" : (s.manager_name ?? "—")}</TableCell>
                          <TableCell>
                            <Badge variant={s.is_active ? "default" : "secondary"}>
                              {s.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!isVirtual && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openNewVirtual(s.id)}
                                title="Adicionar marca"
                              >
                                <Tag className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
