import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Users, Loader2, Search, Building2, AlertTriangle, CheckCircle2, FileDown, PenLine } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getMissingAdmissionDocs, getMissingEmployeeFields } from "@/lib/requiredDocs";
import { sortStores } from "@/lib/storeSort";
import { buildS2200Xml, downloadS2200Xml, getMissingS2200Fields } from "@/lib/esocialS2200Export";
import { getTermsForPosition } from "@/lib/positionTerms";
import { getActiveContractTemplate } from "@/lib/contractPdf";

const COMPANY_CNPJ = "44932369000108";

interface Employee {
  id: string;
  full_name: string;
  cpf: string | null;
  position: string | null;
  contract_type: string | null;
  status: string;
  store_id: string;
  allocated_store_id: string | null;
  gender: string | null;
  contracting_store?: { name: string } | null;
  allocated_store?: { name: string; parent_store_id: string | null } | null;
  [key: string]: any;
}

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "active") return "default";
  if (s === "terminated" || s === "rejected") return "destructive";
  if (s === "in_training" || s === "pending_approval") return "outline";
  return "secondary";
};

const statusLabel: Record<string, string> = {
  active: "Ativo", inactive: "Inativo", on_leave: "Afastado",
  terminated: "Desligado", in_training: "Em treinamento",
  pending_approval: "Aguardando admissão", rejected: "Reprovado",
};

const UNALLOCATED_KEY = "__unallocated__";

const isInternship = (ct?: string | null) => {
  const v = (ct ?? "").toLowerCase();
  return v.includes("estág") || v.includes("estag") || v === "internship";
};

export default function EmployeesList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Employee[]>([]);
  const [docsByEmp, setDocsByEmp] = useState<Record<string, { doc_type: string }[]>>({});
  const [signByEmp, setSignByEmp] = useState<Record<string, { items: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [stores, setStores] = useState<{ id: string; name: string; parent_store_id: string | null }[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: emp, error }, { data: sto }] = await Promise.all([
      supabase
        .from("employees")
        .select("*, contracting_store:stores!employees_store_id_fkey(name), allocated_store:stores!employees_allocated_store_id_fkey(name, parent_store_id)")
        .order("created_at", { ascending: false }),
      supabase.from("stores").select("id, name, parent_store_id, store_type").eq("is_virtual", false).order("name"),
    ]);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    const list = (emp ?? []) as unknown as Employee[];
    setItems(list);
    setStores(sortStores(sto ?? []));

    if (list.length > 0) {
      const ids = list.map((e) => e.id);
      const { data: docs } = await supabase
        .from("employee_documents")
        .select("employee_id, doc_type")
        .in("employee_id", ids);
      const map: Record<string, { doc_type: string }[]> = {};
      (docs ?? []).forEach((d: any) => {
        if (!map[d.employee_id]) map[d.employee_id] = [];
        map[d.employee_id].push({ doc_type: d.doc_type });
      });
      setDocsByEmp(map);

      // ===== Pendências de assinatura (do colaborador) =====
      const userIds = list.map((e) => e.user_id).filter((u): u is string => !!u);
      const userToEmp = new Map<string, Employee>();
      list.forEach((e) => { if (e.user_id) userToEmp.set(e.user_id, e); });

      if (userIds.length > 0) {
        const activeTpl = await getActiveContractTemplate().catch(() => null);
        const hasContractTpl = !!activeTpl;

        const [{ data: regs }, { data: contractSigs }, { data: termAcc }, { data: customDocs }] = await Promise.all([
          supabase
            .from("internal_regulation_acceptances")
            .select("user_id")
            .in("user_id", userIds),
          supabase
            .from("contract_signatures")
            .select("user_id")
            .in("user_id", userIds)
            .is("superseded_at", null),
          supabase
            .from("position_term_acceptances")
            .select("user_id, term_key, term_version")
            .in("user_id", userIds),
          supabase
            .from("custom_documents")
            .select("id, current_version")
            .eq("is_active", true),
        ]);

        const regSet = new Set((regs ?? []).map((r: any) => r.user_id));
        const contractSet = new Set((contractSigs ?? []).map((c: any) => c.user_id));
        const termAccMap = new Map<string, Set<string>>();
        (termAcc ?? []).forEach((a: any) => {
          if (!termAccMap.has(a.user_id)) termAccMap.set(a.user_id, new Set());
          termAccMap.get(a.user_id)!.add(`${a.term_key}::${a.term_version}`);
        });

        let versByDoc: Record<string, { version_number: number; target_positions: string[] | null; target_employee_ids: string[] | null }> = {};
        let customSigSet = new Set<string>();
        const customList = customDocs ?? [];
        if (customList.length > 0) {
          const docIds = customList.map((d: any) => d.id);
          const [{ data: vers }, { data: csigs }] = await Promise.all([
            supabase
              .from("custom_document_versions")
              .select("document_id, version_number, target_positions, target_employee_ids")
              .in("document_id", docIds),
            supabase
              .from("custom_document_signatures")
              .select("user_id, document_id, version_number")
              .in("user_id", userIds)
              .in("document_id", docIds),
          ]);
          (vers ?? []).forEach((v: any) => {
            const d = customList.find((x: any) => x.id === v.document_id);
            if (d && v.version_number === d.current_version) {
              versByDoc[v.document_id] = { version_number: v.version_number, target_positions: v.target_positions, target_employee_ids: v.target_employee_ids };
            }
          });
          customSigSet = new Set((csigs ?? []).map((s: any) => `${s.user_id}::${s.document_id}::${s.version_number}`));
        }

        const sign: Record<string, { items: string[] }> = {};
        for (const e of list) {
          if (!e.user_id) continue;
          const isIntern = isInternship(e.contract_type);
          const items: string[] = [];
          if (!regSet.has(e.user_id)) items.push("Regimento Interno");
          if (hasContractTpl && !isIntern && !contractSet.has(e.user_id)) items.push("Contrato de Trabalho");
          const accepted = termAccMap.get(e.user_id) ?? new Set();
          for (const t of getTermsForPosition(e.position)) {
            if (!accepted.has(`${t.key}::${t.version}`)) items.push(t.title);
          }
          for (const [docId, v] of Object.entries(versByDoc)) {
            const matchesPos = !!e.position && v.target_positions?.includes(e.position);
            const matchesEmp = (v.target_employee_ids ?? []).includes(e.id);
            if (!matchesPos && !matchesEmp) continue;
            if (customSigSet.has(`${e.user_id}::${docId}::${v.version_number}`)) continue;
            items.push("Documento personalizado");
          }
          if (items.length > 0) sign[e.id] = { items };
        }
        setSignByEmp(sign);
      } else {
        setSignByEmp({});
      }
    } else {
      setDocsByEmp({});
      setSignByEmp({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter((e) => {
    if (e.status === "terminated") return false;
    const matchSearch = !search ||
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.cpf?.includes(search) ||
      e.position?.toLowerCase().includes(search.toLowerCase());
    const matchStore = storeFilter === "all" || e.store_id === storeFilter || e.allocated_store_id === storeFilter;
    return matchSearch && matchStore;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; employees: Employee[] }>();
    for (const e of filtered) {
      const key = e.allocated_store_id ?? e.store_id ?? UNALLOCATED_KEY;
      const name = e.allocated_store?.name ?? e.contracting_store?.name ?? "Sem loja";
      if (!map.has(key)) map.set(key, { name, employees: [] });
      map.get(key)!.employees.push(e);
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [filtered]);

  const defaultOpen = useMemo(() => grouped.map((g) => g.key), [grouped]);


  const renderSignBadge = (e: Employee) => {
    const info = signByEmp[e.id];
    if (!info || info.items.length === 0) return null;
    const n = info.items.length;
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/20"
              onClick={() => navigate(`/colaboradores/${e.id}`)}
            >
              <PenLine className="h-3 w-3" />
              <span>{n} p/ assinar</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <div className="text-xs font-semibold mb-1">Aguardando assinatura do colaborador:</div>
            <div className="text-xs">{info.items.join(", ")}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderPendencyBadge = (e: Employee) => {
    const missingDocs = getMissingAdmissionDocs(docsByEmp[e.id] ?? [], e.gender, e.contract_type);
    const missingFields = getMissingEmployeeFields(e);
    // Estagiário não gera folha CLT — não cobramos campos do eSocial S-2200
    const missingEsocial = isInternship(e.contract_type) ? [] : getMissingS2200Fields(e as any);
    // Remover duplicatas que já aparecem em "campos recomendados"
    const fieldLabels = new Set(missingFields.map((f) => f.label.toLowerCase()));
    const esocialOnly = missingEsocial.filter((m) => !fieldLabels.has(m.toLowerCase()));
    const total = missingDocs.length + missingFields.length + esocialOnly.length;
    const sign = renderSignBadge(e);

    const mainBadge = total === 0 ? (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Completo
      </Badge>
    ) : (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-warning/60 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground hover:bg-warning/20"
              onClick={() => navigate(`/colaboradores/${e.id}`)}
            >
              <AlertTriangle className="h-3 w-3" />
              {missingFields.length > 0 && <span>{missingFields.length} campo{missingFields.length > 1 ? "s" : ""}</span>}
              {missingFields.length > 0 && (missingDocs.length > 0 || esocialOnly.length > 0) && <span>·</span>}
              {missingDocs.length > 0 && <span>{missingDocs.length} doc{missingDocs.length > 1 ? "s" : ""}</span>}
              {missingDocs.length > 0 && esocialOnly.length > 0 && <span>·</span>}
              {esocialOnly.length > 0 && <span>{esocialOnly.length} eSocial</span>}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {missingFields.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-semibold mb-1">Campos a preencher:</div>
                <div className="text-xs">{missingFields.map((f) => f.label).join(", ")}</div>
              </div>
            )}
            {missingDocs.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-semibold mb-1">Documentos faltantes:</div>
                <div className="text-xs">{missingDocs.join(", ")}</div>
              </div>
            )}
            {esocialOnly.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1">eSocial (obrigatório p/ folha):</div>
                <div className="text-xs">{esocialOnly.join(", ")}</div>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    if (!sign) return mainBadge;
    return (
      <div className="flex flex-col items-start gap-1">
        {mainBadge}
        {sign}
      </div>
    );
  };


  const exportSingleS2200 = (e: Employee) => {
    const miss = getMissingS2200Fields(e as any);
    if (miss.length > 0) {
      toast({
        title: "Faltam dados para o S-2200",
        description: miss.join(", "),
        variant: "destructive",
      });
      return;
    }
    const xml = buildS2200Xml({ employee: e as any, cnpj: COMPANY_CNPJ });
    downloadS2200Xml(xml, e.full_name, e.cpf);
    toast({ title: "S-2200 gerado", description: e.full_name });
  };

  const exportAllS2200 = async () => {
    const candidates = filtered.filter((e) => (e.status === "active" || e.status === "in_training") && !isInternship(e.contract_type));
    const ready = candidates.filter((e) => getMissingS2200Fields(e as any).length === 0);
    const skipped = candidates.length - ready.length;
    if (ready.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum colaborador com cadastro completo para S-2200.", variant: "destructive" });
      return;
    }
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    ready.forEach((e) => {
      const xml = buildS2200Xml({ employee: e as any, cnpj: COMPANY_CNPJ });
      const safe = (e.full_name ?? "colaborador").replace(/[^a-zA-Z0-9]+/g, "_");
      const cpfDigits = (e.cpf ?? "").replace(/\D/g, "") || "sem-cpf";
      zip.file(`S2200-${safe}-${cpfDigits}.xml`, xml);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eSocial-S2200-lote-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Lote S-2200 gerado",
      description: `${ready.length} XML(s)${skipped > 0 ? ` · ${skipped} ignorado(s) por dados incompletos` : ""}`,
    });
  };

  const renderTable = (rows: Employee[]) => (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {rows.map((e) => {
          const matriz = e.contracting_store?.name ?? "—";
          const alocacao = e.allocated_store?.name ?? matriz;
          const isAllocatedElsewhere = e.allocated_store_id && e.allocated_store_id !== e.store_id;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => navigate(`/colaboradores/${e.id}`)}
              className="w-full text-left rounded-lg border bg-card p-3 hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-sm leading-tight">{e.full_name}</div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={statusVariant(e.status)} className="text-[10px]">
                    {statusLabel[e.status] ?? e.status}
                  </Badge>
                  {e.exclude_from_payroll && (
                    <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">
                      Fora da folha
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                {e.position ?? "—"} {e.contract_type ? `· ${e.contract_type}` : ""}
              </div>
              {isAllocatedElsewhere && (
                <div className="text-[11px] text-muted-foreground mb-2">Alocado em: {alocacao}</div>
              )}
              <div className="mt-1.5 flex items-center justify-between gap-2" onClick={(ev) => ev.stopPropagation()}>
                {renderPendencyBadge(e)}
                {!isInternship(e.contract_type) && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => exportSingleS2200(e)}>
                    <FileDown className="h-3 w-3" /> S-2200
                  </Button>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table className="table-fixed w-full">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Matriz / Alocação</TableHead>
              <TableHead>Pendências</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const matriz = e.contracting_store?.name ?? "—";
              const alocacao = e.allocated_store?.name ?? matriz;
              const isAllocatedElsewhere = e.allocated_store_id && e.allocated_store_id !== e.store_id;
              return (
                <TableRow
                  key={e.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/colaboradores/${e.id}`)}
                >
                  <TableCell className="font-medium truncate">{e.full_name}</TableCell>
                  <TableCell className="truncate">{e.position ?? "—"}</TableCell>
                  <TableCell className="truncate">{e.contract_type ?? "—"}</TableCell>
                  <TableCell>
                    <div className="truncate">{matriz}</div>
                    {isAllocatedElsewhere && (
                      <div className="text-xs text-muted-foreground truncate">Alocado em: {alocacao}</div>
                    )}
                  </TableCell>
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    {renderPendencyBadge(e)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={statusVariant(e.status)}>{statusLabel[e.status] ?? e.status}</Badge>
                      {e.exclude_from_payroll && (
                        <Badge variant="outline" className="text-[10px] border-warning/50 text-warning w-fit">Fora da folha</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    {!isInternship(e.contract_type) && (
                      <Button size="sm" variant="ghost" onClick={() => exportSingleS2200(e)} title="Exportar XML eSocial S-2200">
                        <FileDown className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" onClick={exportAllS2200} className="w-full sm:w-auto">
          <FileDown className="h-4 w-4" /> Exportar S-2200 (filtrados)
        </Button>
        <Button onClick={() => navigate("/colaboradores/novo")} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Cadastro manual
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, CPF ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filtrar por loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas</SelectItem>
                {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              {items.length === 0 ? "Nenhum colaborador cadastrado." : "Nenhum resultado encontrado."}
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
              {grouped.map((g) => (
                <AccordionItem key={g.key} value={g.key}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-left">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{g.name}</span>
                      <Badge variant="secondary" className="ml-1">{g.employees.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>{renderTable(g.employees)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
