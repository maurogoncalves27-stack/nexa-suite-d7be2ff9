import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Save, Upload, AlertTriangle, FileDown, Plus,
  FileSignature, Users, FolderArchive, User, GraduationCap, MapPin, Briefcase, Landmark,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { downloadContractPdf, getActiveContractTemplate, type ContractEmployeeData } from "@/lib/contractPdf";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { generateEmployeePdf, exportEmployeeFolderZip } from "@/lib/employeePdf";
import DependentsManager, { type PendingDependent } from "@/components/DependentsManager";
import DocExtractDialog from "@/components/employees/DocExtractDialog";
import { getMissingAdmissionDocs, getMissingEmployeeFields } from "@/lib/requiredDocs";
import { getMissingS2200Fields } from "@/lib/esocialS2200Export";
import { MARITAL_REQUIRES_SPOUSE } from "@/lib/employeeOptions";

import { sortStores } from "@/lib/storeSort";
import PersonalIdentificationCard from "@/components/employees/form/PersonalIdentificationCard";
import DocumentsAndEducationCard from "@/components/employees/form/DocumentsAndEducationCard";
import AddressCard from "@/components/employees/form/AddressCard";
import ContractCard from "@/components/employees/form/ContractCard";
import BankCard from "@/components/employees/form/BankCard";
import DocumentsAccordionCard, { type DocItem, type PendingDoc } from "@/components/employees/form/DocumentsAccordionCard";

// Helper: string opcional que aceita "", null e undefined
const optStr = (max?: number) => {
  let s = z.string().trim();
  if (max) s = s.max(max);
  return s.nullish().or(z.literal(""));
};

const employeeSchema = z.object({
  full_name: z.string().trim().min(2, "Nome obrigatório").max(100),
  social_name: optStr(100),
  cpf: optStr(14),
  rg: optStr(20),
  email: z.string().trim().email("E-mail inválido").max(255).nullish().or(z.literal("")),
  phone: optStr(20),
  birth_date: optStr(),
  hire_date: optStr(),
  admission_date: optStr(),
  training_start_date: optStr(),
  training_end_date: optStr(),
  training_status: optStr(),
  address: optStr(255),
  zip_code: optStr(10),
  city: optStr(100),
  state: optStr(2),
  position: optStr(100),
  department: optStr(100),
  contract_type: optStr(),
  gender: optStr(),
  gender_identity: optStr(50),
  ethnicity: optStr(),
  education_level: optStr(),
  nationality: optStr(60),
  marital_status: optStr(),
  spouse_name: optStr(100),
  birth_state: optStr(100),
  father_name: optStr(100),
  mother_name: optStr(100),
  nis_number: optStr(20),
  voter_id: optStr(20),
  voter_zone: optStr(10),
  voter_section: optStr(10),
  reservist_number: optStr(30),
  experience_contract_days: optStr(),
  work_schedule: optStr(50),
  exempt_from_timeclock: z.boolean().optional().default(false),
  store_id: z.string().uuid("Selecione a matriz contratante"),
  allocated_store_id: z.string().uuid().nullish().or(z.literal("")),
  status: z.string(),
  salary: optStr(),
  health_plan_copay: optStr(),
  notes: z.string().max(2000).nullish().or(z.literal("")),
  pix_key: optStr(120),
  pix_key_type: optStr(),
  bank_name: z.string().trim().min(1, "Nome do banco é obrigatório").max(120),
  bank_agency: optStr(20),
  bank_account: optStr(30),
  bank_account_type: optStr(),
  // CTPS
  ctps_number: optStr(20),
  ctps_series: optStr(10),
  ctps_uf: optStr(2),
  ctps_issue_date: optStr(),
  // RG complementar
  rg_issuer: optStr(30),
  rg_issue_date: optStr(),
  rg_uf: optStr(2),
  // Contrato / eSocial
  esocial_category: optStr(5),
  work_regime: optStr(30),
  journey_type: optStr(5),
  weekly_hours: optStr(),
  monthly_hours: optStr(),
  salary_type: optStr(20),
  // Periculosidade / insalubridade
  hazard_pay_type: optStr(30),
  hazard_pay_percent: optStr(),
  // Marcadores trabalhistas
  first_job: z.boolean().optional().default(false),
  union_member: z.boolean().optional().default(false),
  is_apprentice: z.boolean().optional().default(false),
  disability_type: optStr(30),
  // CNH
  cnh_number: optStr(20),
  cnh_category: optStr(5),
  cnh_expiration: optStr(),
  // Estrangeiros
  passport_number: optStr(30),
  foreigner_rnm: optStr(30),
  foreigner_visa_type: optStr(30),
  foreigner_arrival_date: optStr(),
  // Flag de teste/desenvolvimento
  exclude_from_payroll: z.boolean().optional().default(false),
});

const EMPTY_EMPLOYEE = {
  full_name: "",
  social_name: "",
  cpf: "",
  rg: "",
  email: "",
  phone: "",
  birth_date: "",
  hire_date: "",
  admission_date: "",
  training_start_date: "",
  training_end_date: "",
  training_status: "pending",
  gender: "",
  gender_identity: "",
  ethnicity: "",
  education_level: "",
  nationality: "Brasileira",
  marital_status: "",
  spouse_name: "",
  birth_state: "",
  father_name: "",
  mother_name: "",
  nis_number: "",
  voter_id: "",
  voter_zone: "",
  voter_section: "",
  reservist_number: "",
  experience_contract_days: "",
  work_schedule: "",
  exempt_from_timeclock: false,
  address: "",
  zip_code: "",
  city: "",
  state: "",
  position: "",
  position_id: null,
  cbo_code: "",
  cbo_title: "",
  department: "",
  contract_type: "CLT",
  store_id: "",
  allocated_store_id: "",
  status: "in_training",
  salary: "",
  health_plan_copay: "",
  notes: "",
  pix_key: "",
  pix_key_type: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
  bank_account_type: "",
  ctps_number: "",
  ctps_series: "",
  ctps_uf: "",
  ctps_issue_date: "",
  rg_issuer: "",
  rg_issue_date: "",
  rg_uf: "",
  esocial_category: "",
  work_regime: "clt",
  journey_type: "",
  weekly_hours: "",
  monthly_hours: "",
  salary_type: "mensal",
  hazard_pay_type: "none",
  hazard_pay_percent: "",
  first_job: false,
  union_member: false,
  is_apprentice: false,
  disability_type: "none",
  cnh_number: "",
  cnh_category: "",
  cnh_expiration: "",
  passport_number: "",
  foreigner_rnm: "",
  foreigner_visa_type: "",
  foreigner_arrival_date: "",
  exclude_from_payroll: false,
};


export default function EmployeeForm() {
  const { id } = useParams();
  const isNew = !id || id === "novo";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromCandidateId = isNew ? searchParams.get("fromCandidate") : null;
  const { user } = useAuth();
  // (legado removido) Cargos s\u00f3 s\u00e3o criados em Configura\u00e7\u00f5es \u2192 Cargos.

  const [stores, setStores] = useState<{ id: string; name: string; cnpj: string | null; legal_name: string | null; parent_store_id: string | null }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [employee, setEmployee] = useState<any>(EMPTY_EMPLOYEE);

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [hasInternshipContract, setHasInternshipContract] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [pendingDependents, setPendingDependents] = useState<PendingDependent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [docType, setDocType] = useState("RG");
  const [file, setFile] = useState<File | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractFiles, setExtractFiles] = useState<{ file: File; doc_type: string }[] | undefined>(undefined);
  const [preparingExtract, setPreparingExtract] = useState(false);
  const [autofillingKey, setAutofillingKey] = useState<string | null>(null);


  const handleGenerateContract = async () => {
    if (!id) return;
    setGeneratingContract(true);
    try {
      const tpl = await getActiveContractTemplate();
      if (!tpl) {
        toast({
          title: "Modelo não configurado",
          description: "Configure o modelo de contrato em Área do Gestor → Contratos.",
          variant: "destructive",
        });
        return;
      }
      const { data: emp, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !emp) throw error || new Error("Colaborador não encontrado");
      await downloadContractPdf(emp as ContractEmployeeData, tpl.content);
      toast({ title: "Contrato gerado" });
    } catch (e: any) {
      toast({ title: "Erro ao gerar contrato", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingContract(false);
    }
  };

  const handleApplyExtracted = (fields: Record<string, string>) => {
    setEmployee((prev: any) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fields)) {
        next[k] = v;
      }
      return next;
    });
  };

  const handleAutofillSingle = async (entry: { file: File; doc_type: string }) => {
    if (preparingExtract) return;
    const isImage = entry.file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(entry.file.name);
    const isPdf = entry.file.type === "application/pdf" || /\.pdf$/i.test(entry.file.name);
    if (!isImage && !isPdf) {
      toast({ title: "Formato incompatível", description: "Use JPG, PNG ou PDF.", variant: "destructive" });
      return;
    }
    if (entry.file.size > 8 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Limite de 8MB para extração por IA.", variant: "destructive" });
      return;
    }
    setPreparingExtract(true);
    try {
      setExtractFiles([entry]);
      setExtractOpen(true);
    } finally {
      setPreparingExtract(false);
    }
  };

  const handleAutofillPending = (p: PendingDoc) => {
    setAutofillingKey(`pending:${p.tempId}`);
    handleAutofillSingle({ file: p.file, doc_type: p.doc_type });
  };

  const handleAutofillUploaded = async (d: DocItem) => {
    setAutofillingKey(`doc:${d.id}`);
    try {
      const lower = d.file_name.toLowerCase();
      const mime = lower.endsWith(".pdf")
        ? "application/pdf"
        : lower.match(/\.(jpe?g|png|webp)$/)
          ? `image/${lower.split(".").pop()!.replace("jpg", "jpeg")}`
          : null;
      if (!mime) {
        toast({ title: "Formato incompatível", description: "Use JPG, PNG ou PDF.", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.storage.from("employee-documents").download(d.file_path);
      if (error || !data) {
        toast({ title: "Erro ao baixar documento", description: error?.message ?? "", variant: "destructive" });
        return;
      }
      if (data.size > 8 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: "Limite de 8MB para extração por IA.", variant: "destructive" });
        return;
      }
      const fileObj = new File([data], d.file_name, { type: mime });
      await handleAutofillSingle({ file: fileObj, doc_type: d.doc_type });
    } finally {
      // autofillingKey será limpo quando o diálogo fechar
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data: sto } = await supabase.from("stores").select("id, name, cnpj, legal_name, parent_store_id, store_type").eq("is_virtual", false).order("name");
      setStores(sortStores(sto ?? []));

      if (!isNew && id) {
        const { data, error } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
        if (error || !data) {
          toast({ title: "Não encontrado", variant: "destructive" });
          navigate("/colaboradores");
          return;
        }
        setEmployee({
          ...data,
          birth_date: data.birth_date ?? "",
          hire_date: data.hire_date ?? "",
          admission_date: data.admission_date ?? "",
          training_start_date: data.training_start_date ?? "",
          training_end_date: data.training_end_date ?? "",
          training_status: data.training_status ?? "pending",
          salary: data.salary?.toString() ?? "",
          health_plan_copay: (data as any).health_plan_copay != null ? String((data as any).health_plan_copay) : "",
          allocated_store_id: data.allocated_store_id ?? data.store_id ?? "",
          pix_key: data.pix_key ?? "",
          pix_key_type: data.pix_key_type ?? "",
          bank_name: data.bank_name ?? "",
          bank_agency: data.bank_agency ?? "",
          bank_account: data.bank_account ?? "",
          bank_account_type: data.bank_account_type ?? "",
        });
        loadDocs(id);
      } else if (isNew && fromCandidateId) {
        const { data: cand } = await supabase
          .from("job_candidates")
          .select(
            "full_name, cpf, email, phone, city, expected_salary, availability, notes, has_experience, source, job_opening_id",
          )
          .eq("id", fromCandidateId)
          .maybeSingle();
        if (cand) {
          let position = "";
          let storeId = "";
          let jobSalary = "";
          let jobTitle = "";
          if (cand.job_opening_id) {
            const { data: job } = await supabase
              .from("job_openings")
              .select("position, store_id, salary_max, salary_min, title")
              .eq("id", cand.job_opening_id)
              .maybeSingle();
            position = job?.position ?? "";
            storeId = job?.store_id ?? "";
            jobTitle = job?.title ?? "";
            const sal = job?.salary_max ?? job?.salary_min;
            if (sal != null) jobSalary = String(sal);
          }
          const today = new Date().toISOString().slice(0, 10);
          const candidateNotes = [
            cand.notes,
            cand.availability ? `Disponibilidade: ${cand.availability}` : null,
            cand.has_experience != null
              ? `Tem experiência: ${cand.has_experience ? "Sim" : "Não"}`
              : null,
            cand.source ? `Origem: ${cand.source}` : null,
            jobTitle ? `Vaga: ${jobTitle}` : null,
          ]
            .filter(Boolean)
            .join("\n");
          setEmployee((prev: any) => ({
            ...prev,
            full_name: cand.full_name ?? "",
            cpf: cand.cpf ?? "",
            email: cand.email ?? "",
            phone: cand.phone ?? "",
            city: cand.city ?? "",
            position,
            store_id: storeId,
            allocated_store_id: storeId,
            salary: cand.expected_salary
              ? String(cand.expected_salary)
              : jobSalary,
            contract_type: prev.contract_type || "clt",
            status: "in_training",
            training_status: "pending",
            training_start_date: today,
            hire_date: prev.hire_date || today,
            admission_date: prev.admission_date || today,
            notes: candidateNotes || prev.notes || "",
          }));
          // Importa os documentos enviados pelo candidato como pendingDocs
          // (serão persistidos em employee_documents quando o cadastro for salvo).
          try {
            const { data: candDocs } = await supabase
              .from("candidate_document_uploads")
              .select("doc_type, file_name, file_path, mime_type")
              .eq("candidate_id", fromCandidateId);
            if (candDocs && candDocs.length > 0) {
              const imported: PendingDoc[] = [];
              for (const cd of candDocs) {
                const { data: blob } = await supabase.storage
                  .from("candidate-documents")
                  .download(cd.file_path);
                if (!blob) continue;
                const fileObj = new File([blob], cd.file_name, {
                  type: cd.mime_type ?? blob.type ?? "application/octet-stream",
                });
                imported.push({
                  tempId: `cand-${cd.file_path}`,
                  doc_type: cd.doc_type,
                  file: fileObj,
                });
              }
              if (imported.length > 0) setPendingDocs(imported);
            }
          } catch (err) {
            console.error("[fromCandidate] falha ao importar documentos:", err);
          }
          toast({
            title: "Iniciando treinamento",
            description: "Dados e documentos do candidato carregados. Complete o cadastro e salve para iniciar o treinamento.",
          });
        }
      }
      setLoading(false);
    };
    load();
  }, [id, isNew, navigate, fromCandidateId]);

  const loadDocs = async (employeeId: string) => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("employee_documents")
        .select("*")
        .eq("employee_id", employeeId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("internship_contracts" as any)
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employeeId),
    ]);
    setDocuments(data ?? []);
    setHasInternshipContract((count ?? 0) > 0);
  };

  const uploadSingleDoc = async (employeeId: string, doc_type: string, fileToUpload: File) => {
    const ext = fileToUpload.name.split(".").pop();
    const path = `${employeeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(path, fileToUpload, { contentType: fileToUpload.type });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      doc_type,
      file_name: fileToUpload.name,
      file_path: path,
      mime_type: fileToUpload.type,
      size_bytes: fileToUpload.size,
      uploaded_by: user?.id,
    });
    if (insErr) throw insErr;
  };

  const handleSubmit = async (e: React.FormEvent, opts: { draft?: boolean } = {}) => {
    e.preventDefault();
    const isDraft = !!opts.draft;
    const parsed = employeeSchema.safeParse(employee);
    if (!parsed.success && !isDraft) {
      const blocking = parsed.error.errors.filter((err) => {
        const path = err.path.join(".");
        return path === "full_name" || path === "store_id";
      });
      if (blocking.length > 0) {
        const first = blocking[0];
        toast({
          title: "Dados obrigatórios faltando",
          description: `${first.path.join(".") || "campo"}: ${first.message}`,
          variant: "destructive",
        });
        return;
      }
      console.warn("[EmployeeForm] non-blocking validation warnings", parsed.error.errors);
    }
    if (isDraft) {
      if (!employee.full_name?.trim()) {
        toast({
          title: "Informe ao menos o nome",
          description: "Para salvar rascunho, preencha o nome completo.",
          variant: "destructive",
        });
        return;
      }
      if (!employee.store_id) {
        toast({
          title: "Selecione a loja",
          description: "Para salvar rascunho, selecione a loja.",
          variant: "destructive",
        });
        return;
      }
    }
    const safeData: any = parsed.success ? parsed.data : employee;
    setSaving(true);

    // Caixa alta para todos os campos de texto da ficha do colaborador.
    // Preservamos campos sensíveis a caixa: email, chaves técnicas (CPF/RG/CEP só dígitos),
    // datas, números, e chave PIX quando for email/aleatória.
    const up = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      return trimmed ? trimmed.toLocaleUpperCase("pt-BR") : null;
    };
    const upPixKey = (v: unknown, type: unknown): string | null => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      if (type === "email" || type === "random") return trimmed;
      return trimmed.toLocaleUpperCase("pt-BR");
    };

    const payload = {
      full_name: up(safeData.full_name),
      social_name: up(safeData.social_name),
      registration_number: safeData.registration_number?.trim() || null,
      cpf: safeData.cpf || null,
      rg: up(safeData.rg),
      email: safeData.email?.trim() || null,
      phone: safeData.phone || null,
      birth_date: safeData.birth_date || null,
      hire_date: safeData.hire_date || null,
      admission_date: safeData.admission_date || null,
      training_start_date: safeData.training_start_date || null,
      training_end_date: safeData.training_end_date || null,
      training_status: safeData.training_status || "pending",
      address: up(safeData.address),
      zip_code: safeData.zip_code || null,
      city: up(safeData.city),
      state: up(safeData.state),
      position: up(safeData.position),
      position_id: employee.position_id || null,
      cbo_code: employee.cbo_code || null,
      cbo_title: up(employee.cbo_title),
      department: up(safeData.department),
      contract_type: safeData.contract_type || null,
      gender: safeData.gender || null,
      gender_identity: safeData.gender_identity || null,
      ethnicity: safeData.ethnicity || null,
      education_level: safeData.education_level || null,
      nationality: up(safeData.nationality),
      marital_status: safeData.marital_status || null,
      spouse_name: MARITAL_REQUIRES_SPOUSE.includes(safeData.marital_status ?? "")
        ? up(safeData.spouse_name)
        : null,
      birth_state: up(safeData.birth_state),
      father_name: up(safeData.father_name),
      mother_name: up(safeData.mother_name),
      nis_number: safeData.nis_number || null,
      voter_id: safeData.voter_id || null,
      voter_zone: safeData.voter_zone || null,
      voter_section: safeData.voter_section || null,
      reservist_number: safeData.reservist_number || null,
      experience_contract_days: safeData.experience_contract_days
        ? Number(safeData.experience_contract_days)
        : null,
      work_schedule: up(safeData.work_schedule),
      exempt_from_timeclock: !!safeData.exempt_from_timeclock,
      store_id: safeData.store_id,
      allocated_store_id: safeData.allocated_store_id || safeData.store_id,
      status: safeData.status,
      termination_date: safeData.status === "terminated" ? (employee.termination_date || null) : null,
      salary: safeData.salary ? Number(safeData.salary) : null,
      health_plan_copay: safeData.health_plan_copay ? Number(safeData.health_plan_copay) : 0,
      notes: up(safeData.notes),
      pix_key: upPixKey(safeData.pix_key, safeData.pix_key_type),
      pix_key_type: safeData.pix_key_type || null,
      bank_name: up(safeData.bank_name),
      bank_agency: safeData.bank_agency || null,
      bank_account: safeData.bank_account || null,
      bank_account_type: safeData.bank_account_type || null,
      // CTPS
      ctps_number: safeData.ctps_number || null,
      ctps_series: safeData.ctps_series || null,
      ctps_uf: safeData.ctps_uf || null,
      ctps_issue_date: safeData.ctps_issue_date || null,
      // RG complementar
      rg_issuer: up(safeData.rg_issuer),
      rg_issue_date: safeData.rg_issue_date || null,
      rg_uf: safeData.rg_uf || null,
      // Contrato / eSocial
      esocial_category: safeData.esocial_category || null,
      work_regime: safeData.work_regime || "clt",
      journey_type: safeData.journey_type || "1",
      weekly_hours: safeData.weekly_hours ? Number(safeData.weekly_hours) : null,
      monthly_hours: safeData.monthly_hours ? Number(safeData.monthly_hours) : null,
      salary_type: safeData.salary_type || "mensal",
      // Periculosidade / insalubridade
      hazard_pay_type: safeData.hazard_pay_type || null,
      hazard_pay_percent: safeData.hazard_pay_percent ? Number(safeData.hazard_pay_percent) : null,
      // Marcadores trabalhistas
      first_job: !!safeData.first_job,
      union_member: !!safeData.union_member,
      is_apprentice: !!safeData.is_apprentice,
      disability_type: safeData.disability_type || null,
      // CNH
      cnh_number: safeData.cnh_number || null,
      cnh_category: safeData.cnh_category || null,
      cnh_expiration: safeData.cnh_expiration || null,
      // Estrangeiros
      passport_number: safeData.passport_number || null,
      foreigner_rnm: safeData.foreigner_rnm || null,
      foreigner_visa_type: safeData.foreigner_visa_type || null,
      foreigner_arrival_date: safeData.foreigner_arrival_date || null,
      exclude_from_payroll: !!safeData.exclude_from_payroll,
    };

    let savedId = id as string | undefined;

    if (isNew) {
      const { data, error } = await supabase
        .from("employees")
        .insert({ ...payload, created_by: user?.id })
        .select()
        .single();
      if (error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      savedId = data.id;

      if (fromCandidateId && savedId && !isDraft) {
        await supabase
          .from("job_candidates")
          .update({ created_employee_id: savedId, current_stage: "teste_pratico" })
          .eq("id", fromCandidateId);
        await supabase.from("candidate_stage_history").insert({
          candidate_id: fromCandidateId,
          to_stage: "teste_pratico",
          notes: "Treinamento iniciado automaticamente",
          changed_by: user?.id,
        });
      } else if (fromCandidateId && savedId && isDraft) {
        // vincular o employee ao candidato sem mover de etapa
        await supabase
          .from("job_candidates")
          .update({ created_employee_id: savedId })
          .eq("id", fromCandidateId);
      }
    } else {
      const { error } = await supabase.from("employees").update(payload).eq("id", id!);
      if (error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
    }

    if (savedId && pendingDocs.length > 0) {
      let uploaded = 0;
      let failed = 0;
      for (const pd of pendingDocs) {
        try {
          await uploadSingleDoc(savedId, pd.doc_type, pd.file);
          uploaded++;
        } catch (err: any) {
          failed++;
          console.error("Upload failed", err);
        }
      }
      setPendingDocs([]);
      if (failed > 0) {
        toast({ title: `${uploaded} doc(s) enviados, ${failed} falharam`, variant: "destructive" });
      }
    }

    if (savedId && isNew && pendingDependents.length > 0) {
      const rows = pendingDependents.map((d) => ({
        employee_id: savedId!,
        full_name: d.full_name,
        birth_date: d.birth_date,
        cpf: d.cpf,
        relationship: d.relationship,
      }));
      const { error: depErr } = await supabase.from("employee_dependents").insert(rows);
      if (depErr) {
        toast({
          title: "Colaborador salvo, mas houve erro ao gravar dependentes",
          description: depErr.message,
          variant: "destructive",
        });
      } else {
        setPendingDependents([]);
      }
    }

    // Gera e arquiva a ficha cadastral em PDF na Pasta do Colaborador (substitui versão anterior)
    if (savedId && !isDraft) {
      try {
        const { uploadEmployeePdfBlob } = await import("@/lib/employeeDocUpload");
        const store = stores.find((s) => s.id === employee.store_id);
        const matriz = store?.parent_store_id
          ? stores.find((s) => s.id === store.parent_store_id)
          : store;
        const blob = (await generateEmployeePdf(
          {
            ...employee,
            id: savedId,
            store_name: store?.name ?? null,
            company_legal_name: matriz?.legal_name ?? store?.legal_name ?? null,
            company_cnpj: matriz?.cnpj ?? store?.cnpj ?? null,
          },
          [],
          { returnBlob: true },
        )) as Blob;
        if (blob) {
          const safe = (employee.full_name || "colaborador").replace(/[^\w\-]+/g, "_");
          await uploadEmployeePdfBlob({
            employeeId: savedId,
            docType: "ficha_cadastral",
            fileName: `ficha_${safe}.pdf`,
            blob,
            uploadedBy: user?.id,
            replaceExisting: true,
          });
        }
      } catch (err) {
        console.error("[EmployeeForm] falha ao arquivar ficha cadastral", err);
      }
    }

    setSaving(false);
    toast({
      title: isDraft
        ? "Rascunho salvo"
        : isNew
          ? "Colaborador cadastrado"
          : "Colaborador atualizado",
    });

    if (isNew && savedId && !isDraft) {
      navigate(`/colaboradores/${savedId}`);
    } else if (isNew && savedId && isDraft) {
      // permanece na ficha para continuar editando
      navigate(`/colaboradores/${savedId}`, { replace: true });
    } else if (savedId) {
      loadDocs(savedId);
    }
  };

  const handleAddPendingDoc = () => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" });
      return;
    }
    setPendingDocs((prev) => [
      ...prev,
      { tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, doc_type: docType, file },
    ]);
    setFile(null);
    const input = document.getElementById("file-input") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const handleUploadNow = async () => {
    if (!file || !id || isNew) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      await uploadSingleDoc(id, docType, file);
      toast({ title: "Documento enviado" });
      setFile(null);
      const input = document.getElementById("file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      loadDocs(id);
    } catch (err: any) {
      toast({ title: "Falha no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePendingDoc = (tempId: string) => {
    setPendingDocs((prev) => prev.filter((p) => p.tempId !== tempId));
  };

  const handleDownload = async (doc: DocItem) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data) {
      toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDeleteDoc = async (doc: DocItem) => {
    if (!confirm(`Excluir "${doc.file_name}"?`)) return;
    await supabase.storage.from("employee-documents").remove([doc.file_path]);
    await supabase.from("employee_documents").delete().eq("id", doc.id);
    toast({ title: "Documento removido" });
    if (id) loadDocs(id);
  };

  const handleExportPdf = async () => {
    const store = stores.find((s) => s.id === employee.store_id);
    const matriz = store?.parent_store_id
      ? stores.find((s) => s.id === store.parent_store_id)
      : store;
    await generateEmployeePdf(
      {
        ...employee,
        id: id ?? employee.id,
        store_name: store?.name ?? null,
        company_legal_name: matriz?.legal_name ?? store?.legal_name ?? null,
        company_cnpj: matriz?.cnpj ?? store?.cnpj ?? null,
      },
      documents.map((d) => ({ doc_type: d.doc_type, file_name: d.file_name, uploaded_at: d.uploaded_at })),
    );
  };

  const handleExportFolder = async () => {
    setExportingZip(true);
    try {
      const store = stores.find((s) => s.id === employee.store_id);
      const matriz = store?.parent_store_id
        ? stores.find((s) => s.id === store.parent_store_id)
        : store;
      await exportEmployeeFolderZip(
        {
          ...employee,
          id: id ?? employee.id,
          store_name: store?.name ?? null,
          company_legal_name: matriz?.legal_name ?? store?.legal_name ?? null,
          company_cnpj: matriz?.cnpj ?? store?.cnpj ?? null,
        },
        documents.map((d) => ({
          doc_type: d.doc_type,
          file_name: d.file_name,
          uploaded_at: d.uploaded_at,
          file_path: d.file_path,
        })),
      );
      toast({ title: "Pasta exportada", description: "ZIP gerado com a ficha e documentos." });
    } catch (err: any) {
      toast({ title: "Falha ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExportingZip(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const missingDocs = isNew
    ? getMissingAdmissionDocs(pendingDocs.map((p) => ({ doc_type: p.doc_type })), employee.gender, employee.contract_type, { hasInternshipContract })
    : getMissingAdmissionDocs(documents, employee.gender, employee.contract_type, { hasInternshipContract });
  const missingFields = getMissingEmployeeFields(employee);
  const isInternshipContract = (() => {
    const v = (employee.contract_type ?? "").toLowerCase();
    return v.includes("estág") || v.includes("estag") || v === "internship";
  })();
  const employeeForPendency = {
    ...employee,
    work_regime: employee.work_regime || "clt",
    salary_type: employee.salary_type || "mensal",
  };
  const missingEsocialAll = isInternshipContract ? [] : getMissingS2200Fields(employeeForPendency as any);
  const fieldLabelsLower = new Set(missingFields.map((f) => f.label.toLowerCase()));
  const missingEsocial = missingEsocialAll.filter((m) => !fieldLabelsLower.has(m.toLowerCase()));
  const isTrainee = employee.status === "in_training" || employee.training_status === "in_progress" || employee.training_status === "pending";

  // Mapeia cada pendência (campo/eSocial) para a seção do accordion correspondente
  const SECTION_BY_FIELD_KEY: Record<string, string> = {
    cpf: "personal", rg: "personal", birth_date: "personal", phone: "personal",
    email: "personal", mother_name: "personal", nationality: "personal",
    marital_status: "personal", full_name: "personal", nis_number: "personal",
    education_level: "docs-edu",
    address: "address", zip_code: "address", city: "address", state: "address",
    position: "contract", contract_type: "contract", admission_date: "contract",
    salary: "contract", work_schedule: "contract",
  };
  const SECTION_BY_ESOCIAL_LABEL: Record<string, string> = {
    "cpf": "personal", "nome": "personal", "nascimento": "personal",
    "sexo": "personal", "nome da mãe": "personal",
    "data de admissão": "contract", "cargo": "contract", "salário": "contract",
    "categoria esocial": "contract", "regime": "contract",
    "tipo de jornada": "contract", "horas semanais": "contract",
    "tipo de salário": "contract",
    "ctps": "docs-edu",
  };
  const pendingCounts: Record<string, number> = {
    personal: 0, "docs-edu": 0, address: 0, contract: 0, bank: 0, dependents: 0,
  };
  for (const f of missingFields) {
    const sec = SECTION_BY_FIELD_KEY[f.key];
    if (sec) pendingCounts[sec] = (pendingCounts[sec] || 0) + 1;
  }
  for (const m of missingEsocial) {
    const sec = SECTION_BY_ESOCIAL_LABEL[m.toLowerCase()];
    if (sec) pendingCounts[sec] = (pendingCounts[sec] || 0) + 1;
  }
  if (!employee.bank_name || String(employee.bank_name).trim() === "") {
    pendingCounts.bank += 1;
  }

  const PendingBadge = ({ count }: { count: number }) =>
    count > 0 ? (
      <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
        {count}
      </span>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      <div className="flex items-end gap-2 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate(fromCandidateId ? "/recrutamento" : "/colaboradores")}
          className="mb-1"
          title={fromCandidateId ? "Voltar ao recrutamento" : "Voltar"}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[180px] mb-1">
          <h1 className="text-xl md:text-2xl font-bold leading-tight">
            {isNew ? "Colaborador" : employee.full_name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isNew ? "Preencha os dados para cadastrar" : "Editar dados e documentos"}
          </p>
        </div>

        <div className="flex-1" />

        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RG">RG</SelectItem>
              <SelectItem value="CPF">CPF</SelectItem>
              <SelectItem value="Carteira de Trabalho">Carteira de Trabalho</SelectItem>
              <SelectItem value="Contrato de Trabalho">Contrato de Trabalho</SelectItem>
              <SelectItem value="Título de Eleitor">Título de Eleitor</SelectItem>
              <SelectItem value="Comprovante de Residência">Comprovante de Residência</SelectItem>
              <SelectItem value="Certificado de Reservista">Certificado de Reservista</SelectItem>
              <SelectItem value="Exame Admissional">Exame Admissional</SelectItem>
              <SelectItem value="Atestado">Atestado</SelectItem>
              <SelectItem value="Medida Disciplinar">Medida Disciplinar</SelectItem>
              <SelectItem value="Termo de Entrega de Uniforme/EPI">Termo de Entrega de Uniforme/EPI</SelectItem>
              <SelectItem value="Termo de Consentimento">Termo de Consentimento</SelectItem>
              <SelectItem value="Comprovante Bancário">Comprovante Bancário</SelectItem>
              <SelectItem value="Outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="file-input" className="text-xs">Arquivo</Label>
          <Input id="file-input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9 w-[200px] text-xs" />
        </div>
        {isNew ? (
          <Button type="button" size="sm" onClick={handleAddPendingDoc} disabled={!file} className="gap-1 h-9">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleUploadNow} disabled={!file || uploading} className="gap-1 h-9">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar
          </Button>
        )}

        {!isNew && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateContract} className="gap-1 h-9" disabled={generatingContract}>
              <FileSignature className="h-4 w-4" />
              Contrato
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExportPdf} className="gap-1 h-9">
              <FileDown className="h-4 w-4" />
              Ficha
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExportFolder} className="gap-1 h-9" disabled={exportingZip}>
              {exportingZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderArchive className="h-4 w-4" />}
              ZIP
            </Button>
          </>
        )}
      </div>

      <DocExtractDialog
        open={extractOpen}
        onOpenChange={(o) => {
          setExtractOpen(o);
          if (!o) {
            setExtractFiles(undefined);
            setAutofillingKey(null);
          }
        }}
        onApply={handleApplyExtracted}
        prefilledFiles={extractFiles}
      />

      {(missingDocs.length > 0 || missingFields.length > 0 || missingEsocial.length > 0) && (
        <Alert className="border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cadastro com pendências</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              O cadastro pode ser salvo, mas as pendências abaixo precisam ser preenchidas para concluir a admissão oficial
              {isTrainee ? " (Trainees podem ficar pendentes do Exame Admissional temporariamente)" : ""}.
            </p>
            {missingFields.length > 0 && (
              <div>
                <p className="font-medium text-sm">Campos a preencher ({missingFields.length}):</p>
                <p className="text-sm">{missingFields.map((f) => f.label).join(", ")}</p>
              </div>
            )}
            {missingEsocial.length > 0 && (
              <div>
                <p className="font-medium text-sm">eSocial S-2200 ({missingEsocial.length}):</p>
                <p className="text-sm">{missingEsocial.join(", ")}</p>
              </div>
            )}
            {missingDocs.length > 0 && (
              <div>
                <p className="font-medium text-sm">Documentos faltantes ({missingDocs.length}):</p>
                <p className="text-sm">{missingDocs.join(", ")}</p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Accordion type="multiple" className="space-y-4">
        <AccordionItem value="personal" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Identificação pessoal</span>
                <PendingBadge count={pendingCounts.personal} />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <PersonalIdentificationCard employee={employee} setEmployee={setEmployee} hideHeader />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="docs-edu" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Documentação e formação</span>
                <PendingBadge count={pendingCounts["docs-edu"]} />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <DocumentsAndEducationCard employee={employee} setEmployee={setEmployee} hideHeader />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="address" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Endereço</span>
                <PendingBadge count={pendingCounts.address} />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <AddressCard employee={employee} setEmployee={setEmployee} hideHeader />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="contract" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Vínculo e contrato</span>
                <PendingBadge count={pendingCounts.contract} />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <ContractCard
                employee={employee}
                setEmployee={setEmployee}
                stores={stores}
                hideHeader
              />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="bank" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Dados bancários e PIX</span>
                <PendingBadge count={pendingCounts.bank} />
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <BankCard employee={employee} setEmployee={setEmployee} hideHeader />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="dependents" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">Dependentes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              {!isNew && id ? (
                <DependentsManager employeeId={id} />
              ) : (
                <DependentsManager
                  pending={pendingDependents}
                  onPendingChange={setPendingDependents}
                />
              )}
            </AccordionContent>
          </Card>
        </AccordionItem>

      </Accordion>

      <DocumentsAccordionCard
        pendingDocs={pendingDocs}
        documents={documents}
        onRemovePending={removePendingDoc}
        onDownload={handleDownload}
        onDelete={handleDeleteDoc}
        onAutofillPending={handleAutofillPending}
        onAutofillUploaded={handleAutofillUploaded}
        autofillingKey={autofillingKey}
      />

      <Accordion type="multiple" className="space-y-4">

        <AccordionItem value="notes" className="border-0">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">Observações</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <Textarea
                value={employee.notes}
                onChange={(e) => setEmployee({ ...employee, notes: e.target.value })}
                rows={4}
                placeholder="Notas internas, observações sobre o colaborador, histórico relevante..."
              />
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      <div className="sticky bottom-0 z-10 -mx-2 px-2 py-3 bg-background/95 backdrop-blur border-t flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => navigate(fromCandidateId ? "/recrutamento" : "/colaboradores")}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={(e) => handleSubmit(e as any, { draft: true })}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar rascunho
        </Button>
        <Button type="submit" disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? "Cadastrar colaborador" : "Salvar alterações"}
          {pendingDocs.length > 0 && (
            <span className="ml-1 text-xs opacity-80">(+{pendingDocs.length} doc)</span>
          )}
        </Button>
      </div>

    </form>
  );
}
