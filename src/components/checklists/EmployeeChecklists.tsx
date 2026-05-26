import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ClipboardList, Send, Clock, Siren, Camera, X, Loader2, CheckCircle2, Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { compressImage } from "@/lib/imageCompression";
import { MaintenancePhotoCaptureButton } from "@/components/nutricontrol/MaintenancePhotoCaptureButton";


interface Template {
  id: string;
  title: string;
  description: string | null;
  deadline_time: string | null;
  weekdays: number[] | null;
}

interface Item {
  id: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_priority: boolean;
  requires_photo: boolean;
}

interface TodaySubmission {
  id: string;
  template_id: string;
  notes: string | null;
  status: string;
}

interface AnswerState {
  checked: boolean;
  observation: string;
  photo_urls: string[];
  checked_at: string | null;
}

const MAX_PHOTOS = 5;
const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getBusinessToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: WEEKDAY_INDEX[value("weekday")] ?? new Date().getDay(),
  };
}

export default function EmployeeChecklists() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  // fileInputRefs removido — captura agora usa MaintenancePhotoCaptureButton (getUserMedia in-page)
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [todaySubmissions, setTodaySubmissions] = useState<TodaySubmission[]>([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const { date: today, weekday: currentWeekday } = getBusinessToday();

  useEffect(() => {
    if (!user) return;
    loadTemplates();
    loadTodaySubmissions();
    loadEmployeeId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadEmployeeId = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    setEmployeeId(data?.id ?? null);
  };

  const loadTemplates = async () => {
    if (!user) return;

    // Visibilidade do checklist é definida exclusivamente pelos GRUPOS DE ACESSO
    // do colaborador. Cada template é atribuído a um ou mais grupos (que
    // representam, por exemplo, as lojas/equipes). O colaborador vê apenas os
    // templates dos grupos a que pertence.
    const { data: userGroups } = await supabase
      .from("user_access_groups")
      .select("group_id")
      .eq("user_id", user.id);
    const groupIds = (userGroups ?? []).map((g: any) => g.group_id);

    if (groupIds.length === 0) {
      setTemplates([]);
      return;
    }

    const { data } = await supabase
      .from("checklist_templates")
      .select("id, title, description, deadline_time, weekdays, template_access_groups!inner(group_id)")
      .eq("is_active", true)
      .in("template_access_groups.group_id", groupIds)
      .order("sort_order");

    if (data) {
      // Deduplica (caso o template esteja em múltiplos grupos do usuário)
      const seen = new Set<string>();
      const filtered = (data as any[]).filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        const dayOk = !t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(currentWeekday);
        return dayOk;
      });
      setTemplates(filtered as Template[]);
    }
  };


  const loadTodaySubmissions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("checklist_submissions")
      .select("id, template_id, notes, status")
      .eq("user_id", user.id)
      .eq("shift_date", today);
    if (data) setTodaySubmissions(data as TodaySubmission[]);
  };

  const ensureSubmission = async (templateId: string): Promise<string | null> => {
    if (activeSubmissionId) return activeSubmissionId;
    if (!user) return null;
    // Verifica se já existe rascunho
    const { data: existing } = await supabase
      .from("checklist_submissions")
      .select("id")
      .eq("user_id", user.id)
      .eq("template_id", templateId)
      .eq("shift_date", today)
      .maybeSingle();
    if (existing?.id) {
      setActiveSubmissionId(existing.id);
      return existing.id;
    }
    const { data: sub, error } = await supabase
      .from("checklist_submissions")
      .insert({
        template_id: templateId,
        user_id: user.id,
        shift_date: today,
        notes: "",
        status: "in_progress",
      })
      .select("id")
      .single();
    if (error || !sub) {
      toast.error("Erro ao iniciar checklist");
      return null;
    }
    setActiveSubmissionId(sub.id);
    return sub.id;
  };

  const selectTemplate = async (templateId: string) => {
    setSelectedTemplate(templateId);
    setIsCompleted(false);
    // Verifica se já tem submissão (rascunho ou completo)
    const existingSub = todaySubmissions.find((s) => s.template_id === templateId);
    let submissionId = existingSub?.id ?? null;
    setActiveSubmissionId(submissionId);
    setIsCompleted(existingSub?.status === "completed");
    setNotes(existingSub?.notes || "");

    const { data: itemsData } = await supabase
      .from("checklist_items")
      .select("id, label, description, sort_order, is_priority, requires_photo")
      .eq("template_id", templateId)
      .order("sort_order");

    const init: Record<string, AnswerState> = {};
    (itemsData || []).forEach((item: any) => {
      init[item.id] = { checked: false, observation: "", photo_urls: [], checked_at: null };
    });

    if (submissionId) {
      const { data: answersData } = await supabase
        .from("checklist_answers")
        .select("item_id, checked, observation, photo_url, photo_urls, checked_at")
        .eq("submission_id", submissionId);
      (answersData || []).forEach((a: any) => {
        const photos: string[] = Array.isArray(a.photo_urls) && a.photo_urls.length > 0
          ? a.photo_urls
          : a.photo_url
            ? [a.photo_url]
            : [];
        init[a.item_id] = {
          checked: !!a.checked,
          observation: a.observation || "",
          photo_urls: photos,
          checked_at: a.checked_at || null,
        };
      });
    }

    setItems((itemsData || []) as Item[]);
    setAnswers(init);
  };

  const upsertAnswer = async (itemId: string, partial: Partial<AnswerState>) => {
    if (!selectedTemplate) return;
    const submissionId = await ensureSubmission(selectedTemplate);
    if (!submissionId) return;
    const current = answers[itemId] ?? { checked: false, observation: "", photo_urls: [], checked_at: null };
    const next = { ...current, ...partial };
    setSavingItem(itemId);
    const { error } = await supabase.from("checklist_answers").upsert(
      {
        submission_id: submissionId,
        item_id: itemId,
        checked: next.checked,
        observation: next.observation || null,
        photo_url: next.photo_urls[0] ?? null,
        photo_urls: next.photo_urls,
        checked_at: next.checked_at,
      },
      { onConflict: "submission_id,item_id" },
    );
    setSavingItem(null);
    if (error) {
      toast.error("Erro ao salvar item");
      return;
    }
    setAnswers((prev) => ({ ...prev, [itemId]: next }));
  };

  const confirmCheckItem = async () => {
    const itemId = confirmItemId;
    if (!itemId) return;
    setConfirmItemId(null);
    await upsertAnswer(itemId, { checked: true, checked_at: new Date().toISOString() });
  };

  const uploadPhoto = async (itemId: string, file: File) => {
    if (!user) return;
    if (!employeeId) {
      toast.error("Seu vínculo de colaborador não foi encontrado");
      return;
    }
    const current = answers[itemId]?.photo_urls ?? [];
    if (current.length >= MAX_PHOTOS) {
      toast.error(`Máximo de ${MAX_PHOTOS} fotos por item`);
      return;
    }
    setUploadingPhoto(itemId);
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Selecione uma imagem válida");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("A foto deve ter no máximo 10MB");
        return;
      }
      const optimizedPhoto = await compressImage(file, {
        maxDimension: 1280,
        quality: 0.72,
        maxBytes: 1_200_000,
      });
      const ext = (optimizedPhoto.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${employeeId}/${Date.now()}_${itemId}_${current.length}.${ext}`;
      const { error } = await supabase.storage
        .from("checklist-photos")
        .upload(path, optimizedPhoto, { contentType: optimizedPhoto.type || "image/jpeg" });
      if (error) {
        toast.error(error.message || "Erro ao enviar foto");
        return;
      }
      const { data: urlData } = supabase.storage.from("checklist-photos").getPublicUrl(path);
      const newPhotos = [...current, urlData.publicUrl];
      await upsertAnswer(itemId, { photo_urls: newPhotos });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar foto");
    } finally {
      setUploadingPhoto(null);
    }
  };

  const removePhoto = async (itemId: string, idx: number) => {
    if (isCompleted) return;
    const current = answers[itemId]?.photo_urls ?? [];
    const newPhotos = current.filter((_, i) => i !== idx);
    await upsertAnswer(itemId, { photo_urls: newPhotos });
  };

  const handleSubmit = async () => {
    if (!user || !selectedTemplate) return;
    const missingObservations = items.filter(
      (item) => !answers[item.id]?.checked && !answers[item.id]?.observation?.trim(),
    );
    if (missingObservations.length > 0) {
      toast.error("Itens não marcados precisam de observação");
      return;
    }
    // Foto temporariamente opcional — obrigatoriedade desativada até estabilizar o upload em mobile

    setSubmitting(true);
    const submissionId = await ensureSubmission(selectedTemplate);
    if (!submissionId) {
      setSubmitting(false);
      return;
    }
    // Salva observações dos itens não-marcados (que não disparam upsert automático)
    const rows = items.map((item) => {
      const a = answers[item.id] ?? { checked: false, observation: "", photo_urls: [], checked_at: null };
      return {
        submission_id: submissionId,
        item_id: item.id,
        checked: a.checked,
        observation: a.observation || null,
        photo_url: a.photo_urls[0] ?? null,
        photo_urls: a.photo_urls,
        checked_at: a.checked_at,
      };
    });
    const { error: ansErr } = await supabase
      .from("checklist_answers")
      .upsert(rows, { onConflict: "submission_id,item_id" });
    if (ansErr) {
      toast.error("Erro ao salvar respostas");
      setSubmitting(false);
      return;
    }
    const { error: subErr } = await supabase
      .from("checklist_submissions")
      .update({ notes, status: "completed", submitted_at: new Date().toISOString() })
      .eq("id", submissionId);
    if (subErr) {
      toast.error("Erro ao concluir checklist");
      setSubmitting(false);
      return;
    }
    toast.success("Check-list enviado!");
    await loadTodaySubmissions();
    setSelectedTemplate(null);
    setActiveSubmissionId(null);
    setIsCompleted(false);
    setSubmitting(false);
  };

  if (selectedTemplate) {
    const template = templates.find((tp) => tp.id === selectedTemplate);
    return (
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedTemplate(null);
              setActiveSubmissionId(null);
              setIsCompleted(false);
            }}
          >
            ← Voltar
          </Button>
          <Badge variant="outline">{today}</Badge>
        </div>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {template?.title}
              {isCompleted && (
                <Badge variant="outline" className="ml-2">
                  Concluído
                </Badge>
              )}
            </CardTitle>
            {template?.description && (
              <CardDescription className="whitespace-pre-line leading-relaxed text-sm mt-2">
                {template.description}
              </CardDescription>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Cada item é salvo automaticamente ao ser marcado. Itens marcados não podem ser desmarcados.
            </p>
          </CardHeader>
        </Card>
        <div className="space-y-4">
          {items.map((item) => {
            const ans = answers[item.id] ?? { checked: false, observation: "", photo_urls: [], checked_at: null };
            const photoCount = ans.photo_urls.length;
            return (
              <Card
                key={item.id}
                className={`transition-colors ${
                  ans.checked
                    ? "border-success bg-success/10"
                    : item.is_priority
                      ? "border-destructive bg-destructive/5"
                      : ""
                }`}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={ans.checked}
                      disabled={ans.checked || isCompleted || savingItem === item.id}
                      onCheckedChange={(checked) => {
                        if (!checked) return;
                        setConfirmItemId(item.id);
                      }}
                    />
                    <div className="flex flex-col flex-1">
                      <span
                        className={`font-semibold text-2xl ${
                          ans.checked ? "text-success line-through" : ""
                        }`}
                      >
                        {item.label}
                        {item.is_priority && !ans.checked && (
                          <Siren className="inline align-text-bottom ml-1 mb-[3px] text-destructive w-[22px] h-[20px]" />
                        )}
                        {item.requires_photo && (
                          <Camera className="inline align-text-bottom ml-1 text-primary w-[22px] h-[21px]" />
                        )}
                        {ans.checked && (
                          <Lock className="inline align-text-bottom ml-1 text-muted-foreground w-[18px] h-[18px]" />
                        )}
                      </span>
                      {item.description && (
                        <span className="text-muted-foreground text-sm">{item.description}</span>
                      )}
                      {ans.checked && ans.checked_at && (
                        <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          Marcado às{" "}
                          {new Date(ans.checked_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.requires_photo && ans.checked && (
                    <div className="space-y-2 pl-7">
                      <div className="flex flex-wrap gap-2">
                        {ans.photo_urls.map((url, idx) => (
                          <div key={url} className="relative inline-block">
                            <img
                              src={url}
                              alt={`Foto ${idx + 1}`}
                              className="h-24 w-24 object-cover rounded-lg border"
                              loading="lazy"
                              decoding="async"
                            />
                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => removePhoto(item.id, idx)}
                                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                                aria-label="Remover foto"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        {!isCompleted && photoCount < MAX_PHOTOS && (
                          <div className="flex items-center gap-2">
                            <MaintenancePhotoCaptureButton
                              disabled={uploadingPhoto === item.id}
                              onCapture={(file) => uploadPhoto(item.id, file)}
                            />
                            {uploadingPhoto === item.id && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {photoCount}/{MAX_PHOTOS}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {photoCount === 0
                          ? "Foto opcional"
                          : `${photoCount} de ${MAX_PHOTOS} fotos`}
                      </p>
                    </div>
                  )}
                  <Textarea
                    placeholder={
                      ans.checked ? "Observação (opcional)" : "Por que não foi feito? (obrigatório)"
                    }
                    value={ans.observation}
                    disabled={isCompleted}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [item.id]: { ...(prev[item.id] ?? ans), observation: e.target.value },
                      }))
                    }
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (ans.observation ?? "")) return;
                      // Persiste observação ao perder foco se item já existe
                      if (activeSubmissionId) {
                        upsertAnswer(item.id, { observation: v });
                      }
                    }}
                    className="text-sm"
                    rows={2}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="mt-4">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações gerais</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Algo a destacar sobre o turno?"
                rows={3}
                disabled={isCompleted}
              />
            </div>
            {!isCompleted && (
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
                <Send className="h-4 w-4" />
                {submitting ? "Enviando..." : "Enviar checklist completo"}
              </Button>
            )}
            {isCompleted && (
              <p className="text-sm text-center text-muted-foreground">
                Este check-list já foi enviado e não pode mais ser alterado.
              </p>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!confirmItemId} onOpenChange={(o) => !o && setConfirmItemId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar marcação?</AlertDialogTitle>
              <AlertDialogDescription>
                Após confirmar, este item será salvo com o horário atual e <strong>não poderá ser desmarcado</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmCheckItem}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold">Check-lists do dia</h2>
        <p className="text-sm mt-1 font-medium text-destructive">
          Importante: preencha com honestidade. As respostas são auditadas.
        </p>
      </div>

      {templates.length > 0 && (() => {
        const total = templates.length;
        const done = templates.filter((tp) =>
          todaySubmissions.find((s) => s.template_id === tp.id && s.status === "completed"),
        ).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        const allDone = done === total;
        return (
          <Card className={`mb-4 ${allDone ? "border-success bg-success/5" : ""}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {allDone ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <ClipboardList className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-sm font-medium">
                    {allDone ? "Todos os checklists concluídos" : "Progresso do dia"}
                  </span>
                </div>
                <Badge variant={allDone ? "default" : "secondary"} className="text-xs">
                  {done}/{total} ({percent}%)
                </Badge>
              </div>
              <Progress value={percent} className="h-2" />
            </CardContent>
          </Card>
        );
      })()}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum checklist atribuído para hoje.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {templates
              .filter((tp) => {
                const sub = todaySubmissions.find((s) => s.template_id === tp.id);
                return !sub || sub.status !== "completed";
              })
              .map((tp) => {
                const now = new Date();
                const isExpired = tp.deadline_time
                  ? (() => {
                      const [h, m] = tp.deadline_time.split(":").map(Number);
                      const deadline = new Date();
                      deadline.setHours(h, m, 0, 0);
                      return now > deadline;
                    })()
                  : false;
                const sub = todaySubmissions.find((s) => s.template_id === tp.id);
                const inProgress = sub?.status === "in_progress";
                return (
                  <Card key={tp.id} className="transition-all hover:shadow-md">
                    <CardHeader className="space-y-3 py-[7px]">
                      <div className="flex items-center justify-between gap-4">
                        <CardTitle className="text-base flex items-center gap-2">
                          {tp.title}
                          {inProgress && (
                            <Badge variant="secondary" className="text-xs">
                              Em andamento
                            </Badge>
                          )}
                        </CardTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectTemplate(tp.id)}
                          disabled={isExpired}
                        >
                          {isExpired ? "Expirado" : inProgress ? "Continuar" : "Preencher"}
                        </Button>
                      </div>
                      {tp.description && (
                        <CardDescription className="whitespace-pre-line leading-relaxed text-sm">
                          {tp.description}
                        </CardDescription>
                      )}
                      {tp.deadline_time && (
                        <p
                          className={`flex items-center gap-1 text-sm ${
                            isExpired ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          Prazo: {tp.deadline_time.slice(0, 5)}
                          {isExpired && " (vencido)"}
                        </p>
                      )}
                    </CardHeader>
                  </Card>
                );
              })}
          </div>

          {todaySubmissions.filter((s) => s.status === "completed").length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3">Já enviados hoje</h3>
              <div className="space-y-2">
                {todaySubmissions
                  .filter((s) => s.status === "completed")
                  .map((sub) => {
                    const tp = templates.find((tt) => tt.id === sub.template_id);
                    if (!tp) return null;
                    return (
                      <Card key={sub.id} className="border-success/50 bg-success/5">
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">{tp.title}</CardTitle>
                              <CardDescription className="text-xs">
                                Enviado · clique para revisar
                              </CardDescription>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => selectTemplate(sub.template_id)}>
                              Ver
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
