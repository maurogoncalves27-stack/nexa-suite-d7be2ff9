import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, Plus, Wrench, Camera, Check, X, ClipboardList, AlertCircle, Clock, CheckCircle2, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageCompression";
import { NutriWaterTankControl } from "./NutriWaterTankControl";
import { MaintenancePhotoCaptureButton } from "./MaintenancePhotoCaptureButton";

interface MaintRecord {
  id: string;
  date: string;
  recorded_at: string;
  equipment_type: string;
  maintenance_type: string;
  note: string;
  store_id: string;
}

interface MaintRequest {
  id: string;
  equipment_type: string;
  description: string;
  urgency: "baixa" | "media" | "alta";
  photo_path: string | null;
  status: "pending" | "approved" | "rejected" | "completed";
  rejection_reason: string | null;
  approval_instructions: string | null;
  assigned_professional_id: string | null;
  assigned_company_id: string | null;
  requested_at: string;
  user_id: string;
  store_id: string;
  maintenance_record_id: string | null;
}

interface OutsourcedProfessional {
  id: string;
  full_name: string | null;
  role_title: string | null;
  specialty: string | null;
  company_id: string | null;
}

interface OutsourcedCompany {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
  service_area: string | null;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

const MAINTENANCE_TYPES = [
  { value: "preventiva", label: "Preventiva" },
  { value: "corretiva", label: "Corretiva" },
  { value: "limpeza_tecnica", label: "Limpeza técnica" },
  { value: "calibracao", label: "Calibração" },
];

const URGENCY_OPTIONS = [
  { value: "baixa", label: "Baixa", className: "bg-muted text-muted-foreground" },
  { value: "media", label: "Média", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { value: "alta", label: "Alta", className: "bg-destructive/15 text-destructive" },
];

const PHOTO_BUCKET = "nutri-maintenance-photos";

export const NutriMaintenanceControl = ({ currentDate, storeId }: Props) => {
  const { user, isAdmin, isManager } = useAuth();
  const [records, setRecords] = useState<MaintRecord[]>([]);
  const [requests, setRequests] = useState<MaintRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Solicitação
  const [reqEquipment, setReqEquipment] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqUrgency, setReqUrgency] = useState<"baixa" | "media" | "alta">("media");
  const [reqPhoto, setReqPhoto] = useState<File | null>(null);
  const [reqStoreId, setReqStoreId] = useState<string | null>(storeId);
  const [accessibleStores, setAccessibleStores] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Dialog para registrar manutenção a partir de solicitação aprovada
  const [completeDialog, setCompleteDialog] = useState<MaintRequest | null>(null);
  const [maintType, setMaintType] = useState<string>("preventiva");
  const [maintNote, setMaintNote] = useState("");

  // Dialog de rejeição
  const [rejectDialog, setRejectDialog] = useState<MaintRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Dialog de aprovação (com instruções para o solicitante)
  const [approveDialog, setApproveDialog] = useState<MaintRequest | null>(null);
  const [approvalInstructions, setApprovalInstructions] = useState("");
  const [assignedTarget, setAssignedTarget] = useState<string>("none");
  // formato: "none" | "professional:<id>" | "company:<id>"

  // Terceirizados disponíveis para vincular ao serviço
  const [professionals, setProfessionals] = useState<OutsourcedProfessional[]>([]);
  const [companies, setCompanies] = useState<OutsourcedCompany[]>([]);

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    if (!user) {
      setRecords([]);
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Determina o escopo:
    //  - admin/manager → SEMPRE todas as lojas (ignora seletor)
    //  - loja selecionada → só ela
    //  - demais usuários → lojas acessíveis via RPC
    let storeIds: string[] | null = null;
    if (isAdmin || isManager) {
      storeIds = null; // todas as lojas
    } else if (storeId) {
      storeIds = [storeId];
    } else {
      const { data: accessRes } = await supabase.rpc(
        "user_accessible_stores" as never,
        { _user_id: user.id } as never,
      );
      storeIds = ((accessRes ?? []) as Array<{ user_accessible_stores: string } | string>)
        .map((r) => (typeof r === "string" ? r : r.user_accessible_stores))
        .filter(Boolean);
      if (storeIds.length === 0) {
        setRecords([]);
        setRequests([]);
        setLoading(false);
        return;
      }
    }

    let recQuery = supabase
      .from("nutri_maintenance_records")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(50);
    let reqQuery = supabase
      .from("nutri_maintenance_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(100);

    if (storeIds) {
      recQuery = recQuery.in("store_id", storeIds);
      reqQuery = reqQuery.in("store_id", storeIds);
    }

    const [recRes, reqRes] = await Promise.all([recQuery, reqQuery]);
    if (recRes.error || reqRes.error) {
      console.error("Erro manutenções", recRes.error, reqRes.error);
      toast.error("Erro ao carregar dados");
    } else {
      setRecords((recRes.data ?? []) as MaintRecord[]);
      setRequests((reqRes.data ?? []) as MaintRequest[]);
    }
    setLoading(false);
  }, [user, storeId, isAdmin, isManager]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Mantém a loja do contexto pré-selecionada no formulário quando ela mudar
  useEffect(() => {
    setReqStoreId(storeId);
  }, [storeId]);

  // Qualquer usuário autenticado pode solicitar manutenção em qualquer loja.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: stores, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .order("name");
      if (error) console.error("Erro ao carregar lojas", error);
      setAccessibleStores((stores ?? []) as { id: string; name: string }[]);
    })();
  }, [user]);

  // Carrega profissionais e empresas terceirizadas ativas para vincular na aprovação
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profRes, compRes] = await Promise.all([
        supabase
          .from("outsourced_professionals")
          .select("id, full_name, role_title, specialty, company_id")
          .eq("status", "active")
          .order("full_name"),
        supabase
          .from("outsourced_companies")
          .select("id, trade_name, legal_name, service_area")
          .eq("status", "active")
          .order("trade_name"),
      ]);
      setProfessionals((profRes.data ?? []) as OutsourcedProfessional[]);
      setCompanies((compRes.data ?? []) as OutsourcedCompany[]);
    })();
  }, [user]);

  const submitRequest = async () => {
    if (!user) return;
    if (!reqStoreId) return toast.error("Selecione uma loja");
    if (!reqEquipment.trim()) return toast.error("Informe o equipamento");
    if (!reqDescription.trim()) return toast.error("Descreva o problema");

    setSubmitting(true);

    try {
      let photo_path: string | null = null;
      if (reqPhoto) {
        const optimizedPhoto = await compressImage(reqPhoto, {
          maxDimension: 1280,
          quality: 0.72,
          maxBytes: 1_200_000,
        });
        const ext = (optimizedPhoto.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${reqStoreId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, optimizedPhoto, { contentType: optimizedPhoto.type || "image/jpeg", upsert: false });
        if (upErr) {
          console.error("Erro ao enviar foto:", upErr);
          toast.error(`Erro ao enviar foto: ${upErr.message}`);
          setSubmitting(false);
          return;
        }
        photo_path = path;
      }

      const { error } = await supabase.from("nutri_maintenance_requests").insert({
        user_id: user.id,
        store_id: reqStoreId,
        equipment_type: reqEquipment.trim(),
        description: reqDescription.trim(),
        urgency: reqUrgency,
        photo_path,
      });

      if (error) {
        console.error("Erro ao criar solicitação:", error);
        if (error.code === "42501" || error.message?.includes("row-level security")) {
          toast.error("Você não tem permissão para criar solicitações nesta loja");
        } else {
          toast.error(`Erro ao criar solicitação: ${error.message}`);
        }
      } else {
        toast.success("Solicitação enviada");
        setReqEquipment("");
        setReqDescription("");
        setReqUrgency("media");
        setReqPhoto(null);
        setReqStoreId(storeId);
        fetchAll();
      }
    } catch (err: any) {
      console.error("Falha inesperada ao enviar solicitação:", err);
      toast.error(`Falha inesperada: ${err?.message ?? "tente novamente"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const approveRequest = async () => {
    if (!user || !approveDialog) return;
    let assigned_professional_id: string | null = null;
    let assigned_company_id: string | null = null;
    if (assignedTarget.startsWith("professional:")) {
      assigned_professional_id = assignedTarget.split(":")[1];
    } else if (assignedTarget.startsWith("company:")) {
      assigned_company_id = assignedTarget.split(":")[1];
    }
    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        approval_instructions: approvalInstructions.trim() || null,
        assigned_professional_id,
        assigned_company_id,
      })
      .eq("id", approveDialog.id);
    if (error) toast.error("Erro ao aprovar");
    else {
      toast.success("Solicitação aprovada");
      setApproveDialog(null);
      setApprovalInstructions("");
      setAssignedTarget("none");
      fetchAll();
    }
  };

  const rejectRequest = async () => {
    if (!user || !rejectDialog) return;
    if (!rejectReason.trim()) return toast.error("Informe o motivo");
    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim(),
      })
      .eq("id", rejectDialog.id);
    if (error) toast.error("Erro ao rejeitar");
    else {
      toast.success("Solicitação rejeitada");
      setRejectDialog(null);
      setRejectReason("");
      fetchAll();
    }
  };

  const removeRequest = async (id: string) => {
    const { error } = await supabase.from("nutri_maintenance_requests").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchAll();
  };

  const reopenRequest = async (id: string) => {
    if (!confirm("Reabrir este chamado? Ele voltará para a fila de aprovação como pendente.")) return;
    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "pending",
        approved_by: null,
        approved_at: null,
        rejection_reason: null,
        maintenance_record_id: null,
        assigned_professional_id: null,
        assigned_company_id: null,
        approval_instructions: null,
      })
      .eq("id", id);
    if (error) toast.error("Erro ao reabrir");
    else {
      toast.success("Chamado reaberto");
      fetchAll();
    }
  };

  const completeRequest = async () => {
    if (!user || !completeDialog) return;

    const { data: rec, error: recErr } = await supabase
      .from("nutri_maintenance_records")
      .insert({
        user_id: user.id,
        store_id: completeDialog.store_id,
        date: dateKey,
        equipment_type: completeDialog.equipment_type,
        maintenance_type: maintType,
        note: maintNote.trim(),
      })
      .select()
      .single();

    if (recErr || !rec) {
      console.error("Erro ao registrar manutenção", recErr);
      toast.error("Erro ao registrar manutenção");
      return;
    }

    const { error: updErr } = await supabase
      .from("nutri_maintenance_requests")
      .update({ status: "completed", maintenance_record_id: rec.id })
      .eq("id", completeDialog.id);

    if (updErr) toast.error("Manutenção registrada, mas falha ao atualizar solicitação");
    else toast.success("Manutenção registrada");

    setCompleteDialog(null);
    setMaintType("preventiva");
    setMaintNote("");
    fetchAll();
  };

  const removeRecord = async (id: string) => {
    const { error } = await supabase.from("nutri_maintenance_records").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchAll();
  };

  const getPhotoUrl = (path: string) =>
    supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const history = requests.filter((r) => r.status === "rejected" || r.status === "completed");
  const requestByRecordId = Object.fromEntries(
    requests.filter((r) => r.maintenance_record_id).map((r) => [r.maintenance_record_id as string, r])
  ) as Record<string, (typeof requests)[number]>;
  const storeNameMap = Object.fromEntries(accessibleStores.map((s) => [s.id, s.name])) as Record<string, string>;
  const viewingAll = isAdmin || isManager || !storeId;
  const showStoreName = viewingAll; // mostra a loja em cada card quando vendo "todas"

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" />
            Manutenções
          </h4>
          <span className="text-[11px] text-muted-foreground">
            {viewingAll ? "Exibindo todas as lojas" : "Exibindo loja selecionada"}
          </span>
        </div>

        <Tabs defaultValue="solicitar" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-2 p-2">
            <TabsTrigger
              value="solicitar"
              className="flex-col sm:flex-row gap-1 sm:gap-2 text-sm sm:text-base font-medium py-3 sm:py-3 min-h-[64px] sm:min-h-[56px]"
            >
              <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
              <span>Solicitar</span>
            </TabsTrigger>
            <TabsTrigger
              value="pendentes"
              className="flex-col sm:flex-row gap-1 sm:gap-2 text-sm sm:text-base font-medium py-3 sm:py-3 min-h-[64px] sm:min-h-[56px]"
            >
              <Clock className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="flex items-center gap-1.5">
                Pendentes
                {pending.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">{pending.length}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="aprovadas"
              className="flex-col sm:flex-row gap-1 sm:gap-2 text-sm sm:text-base font-medium py-3 sm:py-3 min-h-[64px] sm:min-h-[56px]"
            >
              <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="flex items-center gap-1.5">
                Aprovadas
                {approved.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">{approved.length}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="realizadas"
              className="flex-col sm:flex-row gap-1 sm:gap-2 text-sm sm:text-base font-medium py-3 sm:py-3 min-h-[64px] sm:min-h-[56px]"
            >
              <History className="h-5 w-5 sm:h-4 sm:w-4" />
              <span>Realizadas</span>
            </TabsTrigger>
          </TabsList>

          {/* SOLICITAR */}
          <TabsContent value="solicitar" className="mt-3 space-y-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Loja</label>
              <Select value={reqStoreId ?? undefined} onValueChange={(v) => setReqStoreId(v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={accessibleStores.length === 0 ? "Carregando lojas..." : "Selecione a loja"} />
                </SelectTrigger>
                <SelectContent>
                  {accessibleStores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Equipamento</label>
                <Input
                  value={reqEquipment}
                  onChange={(e) => setReqEquipment(e.target.value)}
                  placeholder="Ex: geladeira da cozinha"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Urgência</label>
                <Select value={reqUrgency} onValueChange={(v) => setReqUrgency(v as typeof reqUrgency)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {URGENCY_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição do problema</label>
              <Textarea
                value={reqDescription}
                onChange={(e) => setReqDescription(e.target.value)}
                placeholder="Descreva o que está acontecendo"
                className="text-sm min-h-[70px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" />
                Foto do item (opcional)
              </label>
              <div className="space-y-2">
                <MaintenancePhotoCaptureButton
                  disabled={submitting}
                  onCapture={(file) => {
                    setReqPhoto(file);
                    toast.success("Foto confirmada.");
                  }}
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) {
                      setReqPhoto(null);
                      return;
                    }
                    if (!file.type.startsWith("image/")) {
                      toast.error("Selecione uma imagem válida.");
                      setReqPhoto(null);
                      return;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error("A foto deve ter no máximo 10MB.");
                      setReqPhoto(null);
                      return;
                    }
                    setReqPhoto(file);
                  }}
                  className="h-9 text-sm"
                />
              </div>
              {reqPhoto && (
                <p className="text-xs text-muted-foreground mt-1">{reqPhoto.name}</p>
              )}
            </div>
            <Button type="button" onClick={submitRequest} disabled={submitting} size="sm" className="w-full sm:w-auto gap-1">
              <Plus className="h-4 w-4" />
              {submitting ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </TabsContent>

          {/* PENDENTES (aguardando aprovação) */}
          <TabsContent value="pendentes" className="mt-3 space-y-2">
            {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
            {!loading && pending.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma solicitação pendente.</p>
            )}
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                photoUrl={r.photo_path ? getPhotoUrl(r.photo_path) : null}
                professionals={professionals}
                companies={companies}
                storeName={showStoreName ? storeNameMap[r.store_id] : undefined}
                actions={
                  <>
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setApproveDialog(r)}>
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setRejectDialog(r)}>
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeRequest(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </>
                }
              />
            ))}
          </TabsContent>

          {/* APROVADAS (prontas para registrar) */}
          <TabsContent value="aprovadas" className="mt-3 space-y-2">
            {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
            {!loading && approved.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma solicitação aprovada aguardando.</p>
            )}
            {approved.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                photoUrl={r.photo_path ? getPhotoUrl(r.photo_path) : null}
                professionals={professionals}
                companies={companies}
                storeName={showStoreName ? storeNameMap[r.store_id] : undefined}
                actions={
                  <>
                    <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setCompleteDialog(r)}>
                      <ClipboardList className="h-3.5 w-3.5" /> Registrar concluída
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => reopenRequest(r.id)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                    </Button>
                  </>
                }
              />
            ))}
          </TabsContent>

          {/* REALIZADAS */}
          <TabsContent value="realizadas" className="mt-3 space-y-1.5">
            {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
            {!loading && records.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma manutenção registrada.</p>
            )}
            {records.map((r) => {
              const typeLabel = MAINTENANCE_TYPES.find((t) => t.value === r.maintenance_type)?.label ?? r.maintenance_type;
              return (
                <div key={r.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy")}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                    {typeLabel}
                  </span>
                  <span className="text-xs text-foreground">{r.equipment_type}</span>
                  {showStoreName && storeNameMap[r.store_id] && (
                    <Badge variant="outline" className="text-[10px]">{storeNameMap[r.store_id]}</Badge>
                  )}
                  {r.note && <span className="text-xs text-muted-foreground truncate">— {r.note}</span>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(r.recorded_at), "HH:mm")}
                  </span>
                  {requestByRecordId[r.id] && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] gap-1 px-2"
                      onClick={() => reopenRequest(requestByRecordId[r.id].id)}
                    >
                      <RotateCcw className="h-3 w-3" /> Reabrir
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRecord(r.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              );
            })}

            {history.filter((h) => h.status === "rejected").length > 0 && (
              <div className="pt-3 mt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Solicitações rejeitadas</p>
                <div className="space-y-1.5">
                  {history.filter((h) => h.status === "rejected").map((r) => (
                    <div key={r.id} className="flex items-center gap-2 bg-muted/30 rounded-md px-2.5 py-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">Rejeitada</Badge>
                      <span className="text-xs text-foreground">{r.equipment_type}</span>
                      {r.rejection_reason && (
                        <span className="text-xs text-muted-foreground truncate">— {r.rejection_reason}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => reopenRequest(r.id)}>
                          <RotateCcw className="h-3 w-3" /> Reabrir
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRequest(r.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <NutriWaterTankControl currentDate={currentDate} storeId={storeId} />

      {/* Dialog: registrar manutenção a partir de solicitação aprovada */}
      <Dialog open={!!completeDialog} onOpenChange={(o) => !o && setCompleteDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar manutenção realizada</DialogTitle>
          </DialogHeader>
          {completeDialog && (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-md p-2.5 text-xs space-y-1">
                <p><span className="text-muted-foreground">Equipamento:</span> <span className="font-semibold">{completeDialog.equipment_type}</span></p>
                <p className="text-muted-foreground">{completeDialog.description}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de manutenção</label>
                <Select value={maintType} onValueChange={setMaintType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
                <Textarea
                  value={maintNote}
                  onChange={(e) => setMaintNote(e.target.value)}
                  placeholder="O que foi feito"
                  className="text-sm min-h-[60px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(null)}>Cancelar</Button>
            <Button onClick={completeRequest}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: rejeitar */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar solicitação</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Motivo</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explique o motivo da rejeição"
              className="text-sm min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejectRequest}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: aprovar com instruções para o solicitante */}
      <Dialog
        open={!!approveDialog}
        onOpenChange={(o) => {
          if (!o) {
            setApproveDialog(null);
            setApprovalInstructions("");
            setAssignedTarget("none");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar solicitação</DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-md p-2.5 text-xs space-y-1">
                <p><span className="text-muted-foreground">Equipamento:</span> <span className="font-semibold">{approveDialog.equipment_type}</span></p>
                <p className="text-muted-foreground">{approveDialog.description}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Responsável pelo serviço (opcional)</label>
                <Select value={assignedTarget} onValueChange={setAssignedTarget}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione um profissional ou empresa" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Não atribuir agora</SelectItem>
                    {professionals.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Profissionais
                        </div>
                        {professionals.map((p) => (
                          <SelectItem key={`prof-${p.id}`} value={`professional:${p.id}`}>
                            {p.full_name ?? "Sem nome"}
                            {p.role_title || p.specialty
                              ? ` · ${p.role_title ?? p.specialty}`
                              : ""}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {companies.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Empresas
                        </div>
                        {companies.map((c) => (
                          <SelectItem key={`comp-${c.id}`} value={`company:${c.id}`}>
                            {c.trade_name ?? c.legal_name ?? "Sem nome"}
                            {c.service_area ? ` · ${c.service_area}` : ""}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {professionals.length === 0 && companies.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        Nenhum profissional ou empresa cadastrada.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  O responsável aparecerá no card do solicitante.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Instruções para o solicitante (opcional)</label>
                <Textarea
                  value={approvalInstructions}
                  onChange={(e) => setApprovalInstructions(e.target.value)}
                  placeholder="Ex: aguarde o técnico na próxima terça, isole a área, desligue o equipamento..."
                  className="text-sm min-h-[90px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialog(null);
                setApprovalInstructions("");
                setAssignedTarget("none");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={approveRequest}>Aprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface RequestCardProps {
  req: MaintRequest;
  photoUrl: string | null;
  actions: React.ReactNode;
  professionals?: OutsourcedProfessional[];
  companies?: OutsourcedCompany[];
  storeName?: string;
}

const RequestCard = ({ req, photoUrl, actions, professionals = [], companies = [], storeName }: RequestCardProps) => {
  const urgency = URGENCY_OPTIONS.find((u) => u.value === req.urgency)!;
  const assignedProfessional = req.assigned_professional_id
    ? professionals.find((p) => p.id === req.assigned_professional_id)
    : null;
  const assignedCompany = req.assigned_company_id
    ? companies.find((c) => c.id === req.assigned_company_id)
    : null;
  return (
    <div className="bg-muted/40 rounded-md p-2.5 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${urgency.className}`}>
          {urgency.label}
        </span>
        <span className="text-sm font-semibold text-foreground">{req.equipment_type}</span>
        {storeName && (
          <Badge variant="outline" className="text-[10px]">{storeName}</Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {format(new Date(req.requested_at), "dd/MM HH:mm")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{req.description}</p>
      {(assignedProfessional || assignedCompany) && (
        <div className="rounded-md border border-border bg-background/60 p-2 text-xs flex items-start gap-2">
          <Wrench className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {assignedProfessional ? "Profissional designado" : "Empresa designada"}
            </p>
            <p className="font-semibold text-foreground truncate">
              {assignedProfessional?.full_name ??
                assignedCompany?.trade_name ??
                assignedCompany?.legal_name ??
                "—"}
            </p>
            {assignedProfessional?.role_title || assignedProfessional?.specialty || assignedCompany?.service_area ? (
              <p className="text-muted-foreground truncate">
                {assignedProfessional?.role_title ??
                  assignedProfessional?.specialty ??
                  assignedCompany?.service_area}
              </p>
            ) : null}
          </div>
        </div>
      )}
      {req.approval_instructions && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
          <p className="font-semibold text-primary mb-0.5">Instruções da gestão</p>
          <p className="text-foreground whitespace-pre-wrap">{req.approval_instructions}</p>
        </div>
      )}
      {photoUrl && (
        <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
          <img src={photoUrl} alt="Foto do item" className="max-h-32 rounded border border-border object-cover" loading="lazy" />
        </a>
      )}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">{actions}</div>
    </div>
  );
};
