import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Users, Loader2, Search, Building2, UserX } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Employee {
  id: string;
  full_name: string;
  cpf: string | null;
  position: string | null;
  contract_type: string | null;
  status: string;
  store_id: string;
  allocated_store_id: string | null;
  termination_date: string | null;
  hire_date: string | null;
  contracting_store?: { name: string } | null;
  allocated_store?: { name: string } | null;
}

const UNALLOCATED_KEY = "__unallocated__";

const fmtDate = (d: string | null) =>
  d ? format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—";

export default function TerminatedEmployeesList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [stores, setStores] = useState<{ id: string; name: string; parent_store_id: string | null }[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: emp, error }, { data: sto }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, cpf, position, contract_type, status, store_id, allocated_store_id, termination_date, hire_date, contracting_store:stores!employees_store_id_fkey(name), allocated_store:stores!employees_allocated_store_id_fkey(name)")
        .eq("status", "terminated")
        .order("termination_date", { ascending: false, nullsFirst: false }),
      supabase.from("stores").select("id, name, parent_store_id, store_type").eq("is_virtual", false).order("name"),
    ]);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((emp ?? []) as unknown as Employee[]);
    setStores(sortStores(sto ?? []));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const years = useMemo(() => {
    const set = new Set<string>();
    items.forEach((e) => { if (e.termination_date) set.add(e.termination_date.slice(0, 4)); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const filtered = items.filter((e) => {
    const matchSearch = !search ||
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.cpf?.includes(search) ||
      e.position?.toLowerCase().includes(search.toLowerCase());
    const matchStore = storeFilter === "all" || e.store_id === storeFilter || e.allocated_store_id === storeFilter;
    const matchYear = yearFilter === "all" || (e.termination_date?.startsWith(yearFilter) ?? false);
    return matchSearch && matchStore && matchYear;
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

  const renderTable = (rows: Employee[]) => (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {rows.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => navigate(`/colaboradores/${e.id}`)}
            className="w-full text-left rounded-lg border bg-card p-3 hover:bg-muted/50 active:bg-muted transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-medium text-sm leading-tight">{e.full_name}</div>
              <Badge variant="destructive" className="shrink-0 text-[10px]">Desligado</Badge>
            </div>
            <div className="text-xs text-muted-foreground mb-1">
              {e.position ?? "—"} {e.contract_type ? `· ${e.contract_type}` : ""}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Admissão: {fmtDate(e.hire_date)} · Desligamento: {fmtDate(e.termination_date)}
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table className="table-fixed w-full">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Admissão</TableHead>
              <TableHead>Desligamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow
                key={e.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/colaboradores/${e.id}`)}
              >
                <TableCell className="font-medium truncate">{e.full_name}</TableCell>
                <TableCell className="truncate">{e.position ?? "—"}</TableCell>
                <TableCell className="truncate">{e.contract_type ?? "—"}</TableCell>
                <TableCell className="truncate">{e.allocated_store?.name ?? e.contracting_store?.name ?? "—"}</TableCell>
                <TableCell>{fmtDate(e.hire_date)}</TableCell>
                <TableCell>{fmtDate(e.termination_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, CPF ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {years.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filtrar por loja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas</SelectItem>
                {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            {filtered.length} desligado{filtered.length === 1 ? "" : "s"}
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <UserX className="h-10 w-10 mx-auto mb-3 opacity-50" />
              {items.length === 0 ? "Nenhum colaborador desligado." : "Nenhum resultado encontrado."}
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
