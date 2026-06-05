import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Save, RotateCcw, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EDITABLE_PLACEHOLDERS } from "@/lib/contractPdf";
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contractTemplate";

interface Template {
  id: string;
  name: string;
  content: string;
  is_active: boolean;
}

interface EmployeeOption {
  id: string;
  full_name: string;
  position: string | null;
}

const PLACEHOLDERS = EDITABLE_PLACEHOLDERS;

export default function ContractsPanel() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // Período de experiência (CLT art. 445, parágrafo único — máx 90 dias, 1 prorrogação)
  const PRESETS: { id: string; label: string; initial: number; extension: number }[] = [
    { id: "14_30", label: "14 + 30 dias (44 no total)", initial: 14, extension: 30 },
    { id: "30_60", label: "30 + 60 dias (90)", initial: 30, extension: 60 },
    { id: "45_45", label: "45 + 45 dias (90)", initial: 45, extension: 45 },
    { id: "30_30", label: "30 + 30 dias (60)", initial: 30, extension: 30 },
    { id: "90_0", label: "90 dias, sem prorrogação", initial: 90, extension: 0 },
    { id: "custom", label: "Personalizado", initial: 30, extension: 0 },
  ];
  const [presetId, setPresetId] = useState<string>("14_30");
  const [initialDays, setInitialDays] = useState<number>(14);
  const [extensionDays, setExtensionDays] = useState<number>(30);

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") {
      setInitialDays(p.initial);
      setExtensionDays(p.extension);
    }
  };

  const totalDays = (Number(initialDays) || 0) + (Number(extensionDays) || 0);
  const periodValid =
    Number.isFinite(initialDays) && initialDays >= 1 && initialDays <= 90 &&
    Number.isFinite(extensionDays) && extensionDays >= 0 && extensionDays <= 90 &&
    totalDays >= 1 && totalDays <= 90;


  const load = async () => {
    setLoading(true);
    const [{ data: tpl }, { data: emps }] = await Promise.all([
      supabase
        .from("contract_templates")
        .select("id, name, content, is_active")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id, full_name, position")
        .eq("status", "active")
        .order("full_name"),
    ]);
    if (tpl) {
      setTemplate(tpl as Template);
      setName(tpl.name);
      setContent(tpl.content);
    } else {
      setTemplate(null);
      setName("Contrato Individual de Trabalho — Padrão CLT");
      setContent(DEFAULT_CONTRACT_TEMPLATE);
    }
    setEmployees((emps ?? []) as EmployeeOption[]);
    setLoading(false);
  };

  const restoreDefault = () => {
    setName("Contrato Individual de Trabalho — Padrão CLT");
    setContent(DEFAULT_CONTRACT_TEMPLATE);
    toast({ title: "Modelo padrão restaurado", description: "Lembre-se de salvar para aplicar." });
  };

  useEffect(() => { load(); }, []);

  const saveTemplate = async (): Promise<Template | null> => {
    if (!name.trim() || !content.trim()) {
      toast({ title: "Preencha nome e conteúdo", variant: "destructive" });
      return null;
    }
    setSaving(true);
    const payload = { name: name.trim(), content, is_active: true };
    let result: Template | null = null;
    if (template) {
      const { data, error } = await supabase
        .from("contract_templates")
        .update(payload)
        .eq("id", template.id)
        .select("id, name, content, is_active")
        .maybeSingle();
      if (error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return null;
      }
      result = (data as Template) ?? null;
    } else {
      const { data, error } = await supabase
        .from("contract_templates")
        .insert(payload)
        .select("id, name, content, is_active")
        .maybeSingle();
      if (error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return null;
      }
      result = (data as Template) ?? null;
    }
    setSaving(false);
    if (result) setTemplate(result);
    toast({ title: "Modelo salvo" });
    return result;
  };

  const generateForEmployee = async () => {
    if (!selectedEmployeeId) {
      toast({ title: "Selecione um colaborador", variant: "destructive" });
      return;
    }
    if (!periodValid) {
      toast({
        title: "Período de experiência inválido",
        description: "A soma de inicial + prorrogação deve estar entre 1 e 90 dias (CLT art. 445).",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      // Persiste período de experiência escolhido no colaborador
      const { error: empUpdErr } = await supabase
        .from("employees")
        .update({
          experience_initial_days: initialDays,
          experience_extension_days: extensionDays || null,
          experience_contract_days: initialDays, // retrocompat
        } as any)
        .eq("id", selectedEmployeeId);
      if (empUpdErr) {
        setGenerating(false);
        toast({ title: "Erro ao salvar período", description: empUpdErr.message, variant: "destructive" });
        return;
      }

      // Garante que o template ativo no banco reflete o conteúdo atual
      const tpl = await saveTemplate();
      if (!tpl) return;


      const { data: emp, error } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("id", selectedEmployeeId)
        .maybeSingle();
      if (error || !emp) {
        toast({ title: "Erro ao carregar colaborador", description: error?.message, variant: "destructive" });
        return;
      }

      // Invalida assinaturas anteriores deste colaborador, forçando nova assinatura
      const { error: supErr } = await supabase
        .from("contract_signatures")
        .update({ superseded_at: new Date().toISOString() } as any)
        .eq("employee_id", selectedEmployeeId)
        .is("superseded_at", null);
      if (supErr) {
        toast({ title: "Erro ao gerar contrato", description: supErr.message, variant: "destructive" });
        return;
      }

      // Cria aviso direcionado ao colaborador + dispara push notification
      const empName = (emp as any).full_name as string;
      const { data: ann, error: annErr } = await supabase
        .from("hr_announcements")
        .insert({
          title: "Novo contrato disponível para assinatura",
          message: `Olá ${empName.split(" ")[0]}, um novo Contrato Individual de Trabalho está disponível na sua Área do Colaborador, aba Documentos. Por favor, leia e assine eletronicamente.`,
          priority: "high",
          scope: "employee",
          employee_id: selectedEmployeeId,
          is_active: true,
          send_push: true,
        })
        .select("id")
        .maybeSingle();

      if (annErr) {
        // não bloqueia o fluxo se falhar a criação do aviso
        console.error("Erro ao criar aviso de contrato:", annErr);
      } else if (ann?.id) {
        supabase.functions
          .invoke("send-push-notification", { body: { announcement_id: ann.id } })
          .catch((e) => console.error("Falha ao enviar push de contrato:", e));
      }

      toast({
        title: "Contrato disponibilizado",
        description: `${empName} foi notificado(a) e verá o novo contrato pendente na aba Documentos. A assinatura anterior foi substituída.`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao gerar contrato", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Contrato Individual de Trabalho
        </CardTitle>
        <CardDescription>
          Selecione um colaborador, ajuste o modelo se necessário, o contrato será disponibilizado na Área do Colaborador para leitura e assinatura eletrônica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Colaborador</Label>
          <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}{e.position ? ` — ${e.position}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-base font-semibold">Cláusulas do contrato (parte editável)</Label>
            <p className="text-sm text-muted-foreground mt-1 mb-2">
              Edite apenas as cláusulas customizáveis abaixo o contrato será gerado automaticamente pelo sistema e não podem ser alterados aqui.
            </p>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={restoreDefault} disabled={saving || generating}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar modelo padrão
          </Button>
          <Button onClick={generateForEmployee} disabled={generating || saving || !selectedEmployeeId}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Gerar contrato
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
