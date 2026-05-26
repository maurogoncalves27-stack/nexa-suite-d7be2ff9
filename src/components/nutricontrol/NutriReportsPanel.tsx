import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Download, UserCheck, Thermometer, PackageCheck, Droplet, Bug, Waves, Wrench, FileText, FileSpreadsheet, ChevronDown } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const daysAgoStr = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.info("Sem dados para exportar");
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(filename: string, title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.info("Sem dados para exportar");
    return;
  }
  const headers = Object.keys(rows[0]);
  const body = rows.map((r) => headers.map((h) => {
    const v = r[h];
    return v === null || v === undefined ? "" : String(v);
  }));
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}  •  ${rows.length} registro(s)`, 40, 56);
  autoTable(doc, {
    head: [headers],
    body,
    startY: 70,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
  });
  doc.save(filename);
}

export default function NutriReportsPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("all");
  const [from, setFrom] = useState<string>(daysAgoStr(30));
  const [to, setTo] = useState<string>(todayStr());

  useEffect(() => {
    supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name").then(({ data }) => {
      setStores(sortStores(data ?? []));
    });
  }, []);

  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.name])), [stores]);
  const filterCommon = (q: any) => {
    let query = q.gte("date", from).lte("date", to);
    if (storeId !== "all") query = query.eq("store_id", storeId);
    return query;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(7)); setTo(todayStr()); }}>7d</Button>
              <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(30)); setTo(todayStr()); }}>30d</Button>
              <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(90)); setTo(todayStr()); }}>90d</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="higiene">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="higiene" className="gap-1.5"><UserCheck className="h-4 w-4" />Higiene</TabsTrigger>
          <TabsTrigger value="temperatura" className="gap-1.5"><Thermometer className="h-4 w-4" />Temperatura</TabsTrigger>
          <TabsTrigger value="mercadoria" className="gap-1.5"><PackageCheck className="h-4 w-4" />Mercadoria</TabsTrigger>
          <TabsTrigger value="oleo" className="gap-1.5"><Droplet className="h-4 w-4" />Óleo</TabsTrigger>
          <TabsTrigger value="pragas" className="gap-1.5"><Bug className="h-4 w-4" />Pragas</TabsTrigger>
          <TabsTrigger value="caixa-dagua" className="gap-1.5"><Waves className="h-4 w-4" />Caixa d'água</TabsTrigger>
          <TabsTrigger value="manutencao" className="gap-1.5"><Wrench className="h-4 w-4" />Manutenção</TabsTrigger>
        </TabsList>

        <TabsContent value="higiene" className="mt-4">
          <HygieneReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
        <TabsContent value="temperatura" className="mt-4">
          <TemperatureReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
        <TabsContent value="mercadoria" className="mt-4">
          <MerchandiseReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
        <TabsContent value="oleo" className="mt-4">
          <OilReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
        <TabsContent value="pragas" className="mt-4">
          <PestReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
        <TabsContent value="caixa-dagua" className="mt-4">
          <WaterTankReport from={from} to={to} storeId={storeId} storeMap={storeMap} />
        </TabsContent>
        <TabsContent value="manutencao" className="mt-4">
          <MaintenanceReport from={from} to={to} storeId={storeId} storeMap={storeMap} filterCommon={filterCommon} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ReportProps {
  from: string;
  to: string;
  storeId: string;
  storeMap: Record<string, string>;
  filterCommon?: (q: any) => any;
}

// Agrupa linhas por store_id quando "Todas as lojas" está selecionado.
// Retorna um array de [storeName, rows[]] já ordenado pelo nome da loja.
function groupByStore<T extends { store_id?: string | null }>(
  rows: T[],
  storeMap: Record<string, string>,
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = (r.store_id ?? "—") as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries())
    .map(([sid, rs]) => [storeMap[sid] ?? "Sem loja", rs] as [string, T[]])
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}

function GroupHeader({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mt-4 first:mt-0 bg-muted/60 rounded-t-md border border-b-0">
      <span className="text-sm font-semibold text-foreground uppercase tracking-wide">{name}</span>
      <Badge variant="secondary" className="text-[10px]">{count} registro(s)</Badge>
    </div>
  );
}

function GroupWrapper({ children }: { children: React.ReactNode }) {
  return <div className="border rounded-b-md mb-2 overflow-hidden">{children}</div>;
}

function ReportShell({
  title,
  count,
  loading,
  baseFilename,
  getRows,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  baseFilename: string;
  getRows: () => Record<string, unknown>[];
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title} <Badge variant="secondary" className="ml-2">{count}</Badge></CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading || count === 0}>
              <Download className="h-4 w-4 mr-2" />Exportar
              <ChevronDown className="h-3 w-3 ml-1.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => downloadCSV(`${baseFilename}.csv`, getRows())}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />CSV (Excel)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadPDF(`${baseFilename}.pdf`, title, getRows())}>
              <FileText className="h-4 w-4 mr-2" />PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro no período.</p>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function HygieneReport({ from, to, storeId, storeMap }: ReportProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_day_records")
      .select("date, sim_nao, note, store_id, nutri_items(name)")
      .gte("date", from).lte("date", to)
      .order("date", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const conformity = rows.length ? Math.round((rows.filter(r => r.sim_nao).length / rows.length) * 100) : 0;
  const buildRows = () => rows.map(r => ({
    data: r.date, loja: storeMap[r.store_id] ?? "—", item: r.nutri_items?.name ?? "—",
    conforme: r.sim_nao ? "Sim" : "Não", observacao: r.note ?? "",
  }));

  return (
    <ReportShell title={`Higiene — Conformidade ${conformity}%`} count={rows.length} loading={loading} baseFilename={`higiene_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Item</TableHead>
                <TableHead>Conforme</TableHead><TableHead>Observação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {group.slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{r.nutri_items?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.sim_nao ? "default" : "destructive"}>{r.sim_nao ? "Sim" : "Não"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{r.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {group.length > 200 && <p className="text-xs text-muted-foreground mt-1">Exibindo 200 de {group.length} — exporte para ver todos.</p>}
          </div>
        ))
      ) : (
        <>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Loja</TableHead><TableHead>Item</TableHead>
              <TableHead>Conforme</TableHead><TableHead>Observação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.slice(0, 200).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>
                  <TableCell>{r.nutri_items?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.sim_nao ? "default" : "destructive"}>{r.sim_nao ? "Sim" : "Não"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{r.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > 200 && <p className="text-xs text-muted-foreground mt-2">Exibindo 200 de {rows.length} — exporte para ver todos.</p>}
        </>
      )}
    </ReportShell>
  );
}

function TemperatureReport({ from, to, storeId, storeMap }: ReportProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_temperature_readings")
      .select("date, recorded_at, temperature, note, store_id, nutri_equipment(name)")
      .gte("date", from).lte("date", to)
      .order("recorded_at", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const buildRows = () => rows.map(r => ({
    data: r.date, hora: format(new Date(r.recorded_at), "HH:mm"),
    loja: storeMap[r.store_id] ?? "—", equipamento: r.nutri_equipment?.name ?? "—",
    temperatura_C: r.temperature, observacao: r.note ?? "",
  }));

  const renderRow = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
      <TableCell>{format(new Date(r.recorded_at), "HH:mm")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.nutri_equipment?.name ?? "—"}</TableCell>
      <TableCell className="font-mono">{r.temperature}</TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  return (
    <ReportShell title="Temperatura" count={rows.length} loading={loading} baseFilename={`temperatura_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Hora</TableHead>
                <TableHead>Equipamento</TableHead><TableHead>Temp. (°C)</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.slice(0, 200).map((r, i) => renderRow(r, i, false))}</TableBody>
            </Table>
          </div>
        ))
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Hora</TableHead><TableHead>Loja</TableHead>
            <TableHead>Equipamento</TableHead><TableHead>Temp. (°C)</TableHead><TableHead>Obs.</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.slice(0, 200).map((r, i) => renderRow(r, i, true))}</TableBody>
        </Table>
      )}
    </ReportShell>
  );
}

function MerchandiseReport({ from, to, storeId, storeMap }: ReportProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_merchandise_receipts")
      .select("date, received_at, batch, product_name, supplier, temperature, storage_type, has_irregularity, is_return, note, store_id")
      .gte("date", from).lte("date", to)
      .order("received_at", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const irregular = rows.filter(r => r.has_irregularity).length;
  const buildRows = () => rows.map(r => ({
    data: r.date, hora: format(new Date(r.received_at), "HH:mm"),
    loja: storeMap[r.store_id] ?? "—", produto: r.product_name, fornecedor: r.supplier,
    lote: r.batch, temperatura_C: r.temperature, armazenamento: r.storage_type,
    irregularidade: r.has_irregularity ? "Sim" : "Não", devolucao: r.is_return ? "Sim" : "Não",
    observacao: r.note ?? "",
  }));

  const renderRow = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.product_name}</TableCell>
      <TableCell>{r.supplier}</TableCell>
      <TableCell className="font-mono text-xs">{r.batch}</TableCell>
      <TableCell className="font-mono">{r.temperature}°C</TableCell>
      <TableCell className="capitalize">{r.storage_type}</TableCell>
      <TableCell>
        {r.has_irregularity && <Badge variant="destructive" className="mr-1">Irreg.</Badge>}
        {r.is_return && <Badge variant="outline">Devol.</Badge>}
        {!r.has_irregularity && !r.is_return && <Badge variant="secondary">OK</Badge>}
      </TableCell>
    </TableRow>
  );

  return (
    <ReportShell title={`Mercadoria — ${irregular} irregularidade(s)`} count={rows.length} loading={loading} baseFilename={`mercadoria_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Produto</TableHead>
                <TableHead>Fornecedor</TableHead><TableHead>Lote</TableHead>
                <TableHead>Temp.</TableHead><TableHead>Armazen.</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.slice(0, 200).map((r, i) => renderRow(r, i, false))}</TableBody>
            </Table>
          </div>
        ))
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Loja</TableHead><TableHead>Produto</TableHead>
            <TableHead>Fornecedor</TableHead><TableHead>Lote</TableHead>
            <TableHead>Temp.</TableHead><TableHead>Armazen.</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.slice(0, 200).map((r, i) => renderRow(r, i, true))}</TableBody>
        </Table>
      )}
    </ReportShell>
  );
}

function OilReport({ from, to, storeId, storeMap }: ReportProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_oil_quality_records")
      .select("date, recorded_at, quality, changed, note, store_id")
      .gte("date", from).lte("date", to)
      .order("recorded_at", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const changes = rows.filter(r => r.changed).length;
  const buildRows = () => rows.map(r => ({
    data: r.date, hora: format(new Date(r.recorded_at), "HH:mm"),
    loja: storeMap[r.store_id] ?? "—", qualidade: r.quality,
    trocado: r.changed ? "Sim" : "Não", observacao: r.note ?? "",
  }));

  const renderRow = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
      <TableCell>{format(new Date(r.recorded_at), "HH:mm")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>
        <Badge variant={r.quality === "bom" ? "default" : "destructive"} className="capitalize">{r.quality}</Badge>
      </TableCell>
      <TableCell>{r.changed ? "Sim" : "Não"}</TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  return (
    <ReportShell title={`Óleo — ${changes} troca(s)`} count={rows.length} loading={loading} baseFilename={`oleo_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Hora</TableHead>
                <TableHead>Qualidade</TableHead><TableHead>Trocado</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.slice(0, 200).map((r, i) => renderRow(r, i, false))}</TableBody>
            </Table>
          </div>
        ))
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Hora</TableHead><TableHead>Loja</TableHead>
            <TableHead>Qualidade</TableHead><TableHead>Trocado</TableHead><TableHead>Obs.</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.slice(0, 200).map((r, i) => renderRow(r, i, true))}</TableBody>
        </Table>
      )}
    </ReportShell>
  );
}

function PestReport({ from, to, storeId, storeMap }: ReportProps) {
  const [services, setServices] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let qS = supabase.from("nutri_pest_control_records")
      .select("service_date, company_name, certificate_url, note, store_id")
      .gte("service_date", from).lte("service_date", to)
      .order("service_date", { ascending: false });
    let qO = supabase.from("nutri_pest_occurrences")
      .select("date, recorded_at, pest_type, location, note, store_id")
      .gte("date", from).lte("date", to)
      .order("recorded_at", { ascending: false });
    if (storeId !== "all") { qS = qS.eq("store_id", storeId); qO = qO.eq("store_id", storeId); }
    Promise.all([qS, qO]).then(([s, o]) => {
      setServices(s.data ?? []); setOccurrences(o.data ?? []); setLoading(false);
    });
  }, [from, to, storeId]);

  const buildServices = () => services.map(r => ({
    data_servico: r.service_date, loja: storeMap[r.store_id] ?? "—",
    empresa: r.company_name, certificado: r.certificate_url ?? "", observacao: r.note ?? "",
  }));
  const buildOccurrences = () => occurrences.map(r => ({
    data: r.date, hora: format(new Date(r.recorded_at), "HH:mm"),
    loja: storeMap[r.store_id] ?? "—", praga: r.pest_type, local: r.location, observacao: r.note ?? "",
  }));

  const renderService = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.service_date), "dd/MM/yyyy")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.company_name}</TableCell>
      <TableCell>
        {r.certificate_url ? (
          <a href={r.certificate_url} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a>
        ) : "—"}
      </TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  const renderOccurrence = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
      <TableCell>{format(new Date(r.recorded_at), "HH:mm")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.pest_type}</TableCell>
      <TableCell>{r.location}</TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <ReportShell title="Pragas — Serviços profissionais" count={services.length} loading={loading} baseFilename={`pragas_servicos_${from}_${to}`} getRows={buildServices}>
        {storeId === "all" ? (
          groupByStore(services, storeMap).map(([name, group]) => (
            <div key={name}>
              <GroupHeader name={name} count={group.length} />
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Empresa</TableHead>
                  <TableHead>Certificado</TableHead><TableHead>Obs.</TableHead>
                </TableRow></TableHeader>
                <TableBody>{group.map((r, i) => renderService(r, i, false))}</TableBody>
              </Table>
            </div>
          ))
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Loja</TableHead><TableHead>Empresa</TableHead>
              <TableHead>Certificado</TableHead><TableHead>Obs.</TableHead>
            </TableRow></TableHeader>
            <TableBody>{services.map((r, i) => renderService(r, i, true))}</TableBody>
          </Table>
        )}
      </ReportShell>
      <ReportShell title="Pragas — Ocorrências" count={occurrences.length} loading={loading} baseFilename={`pragas_ocorrencias_${from}_${to}`} getRows={buildOccurrences}>
        {storeId === "all" ? (
          groupByStore(occurrences, storeMap).map(([name, group]) => (
            <div key={name}>
              <GroupHeader name={name} count={group.length} />
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Hora</TableHead>
                  <TableHead>Praga</TableHead><TableHead>Local</TableHead><TableHead>Obs.</TableHead>
                </TableRow></TableHeader>
                <TableBody>{group.slice(0, 200).map((r, i) => renderOccurrence(r, i, false))}</TableBody>
              </Table>
            </div>
          ))
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Hora</TableHead><TableHead>Loja</TableHead>
              <TableHead>Praga</TableHead><TableHead>Local</TableHead><TableHead>Obs.</TableHead>
            </TableRow></TableHeader>
            <TableBody>{occurrences.slice(0, 200).map((r, i) => renderOccurrence(r, i, true))}</TableBody>
          </Table>
        )}
      </ReportShell>
    </div>
  );
}

function WaterTankReport({ from, to, storeId, storeMap }: Omit<ReportProps, "filterCommon">) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_water_tank_cleanings")
      .select("cleaning_date, responsible, report_url, note, store_id")
      .gte("cleaning_date", from).lte("cleaning_date", to)
      .order("cleaning_date", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const buildRows = () => rows.map(r => ({
    data_limpeza: r.cleaning_date, loja: storeMap[r.store_id] ?? "—",
    responsavel: r.responsible, laudo: r.report_url ?? "", observacao: r.note ?? "",
  }));

  const renderRow = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.cleaning_date), "dd/MM/yyyy")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.responsible}</TableCell>
      <TableCell>
        {r.report_url ? (
          <a href={r.report_url} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a>
        ) : "—"}
      </TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  return (
    <ReportShell title="Caixa d'água — Limpezas" count={rows.length} loading={loading} baseFilename={`caixa_dagua_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Responsável</TableHead>
                <TableHead>Laudo</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.map((r, i) => renderRow(r, i, false))}</TableBody>
            </Table>
          </div>
        ))
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Loja</TableHead><TableHead>Responsável</TableHead>
            <TableHead>Laudo</TableHead><TableHead>Obs.</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((r, i) => renderRow(r, i, true))}</TableBody>
        </Table>
      )}
    </ReportShell>
  );
}

function MaintenanceReport({ from, to, storeId, storeMap }: ReportProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("nutri_maintenance_records")
      .select("date, recorded_at, equipment_type, maintenance_type, note, store_id")
      .gte("date", from).lte("date", to)
      .order("recorded_at", { ascending: false });
    if (storeId !== "all") q = q.eq("store_id", storeId);
    q.then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [from, to, storeId]);

  const buildRows = () => rows.map(r => ({
    data: r.date, hora: format(new Date(r.recorded_at), "HH:mm"),
    loja: storeMap[r.store_id] ?? "—", equipamento: r.equipment_type,
    tipo: r.maintenance_type, observacao: r.note ?? "",
  }));

  const renderRow = (r: any, i: number, includeStore: boolean) => (
    <TableRow key={i}>
      <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
      <TableCell>{format(new Date(r.recorded_at), "HH:mm")}</TableCell>
      {includeStore && <TableCell>{storeMap[r.store_id] ?? "—"}</TableCell>}
      <TableCell>{r.equipment_type}</TableCell>
      <TableCell className="capitalize">{r.maintenance_type}</TableCell>
      <TableCell className="max-w-xs truncate">{r.note}</TableCell>
    </TableRow>
  );

  return (
    <ReportShell title="Manutenção" count={rows.length} loading={loading} baseFilename={`manutencao_${from}_${to}`} getRows={buildRows}>
      {storeId === "all" ? (
        groupByStore(rows, storeMap).map(([name, group]) => (
          <div key={name}>
            <GroupHeader name={name} count={group.length} />
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Hora</TableHead>
                <TableHead>Equipamento</TableHead><TableHead>Tipo</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>{group.map((r, i) => renderRow(r, i, false))}</TableBody>
            </Table>
          </div>
        ))
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Hora</TableHead><TableHead>Loja</TableHead>
            <TableHead>Equipamento</TableHead><TableHead>Tipo</TableHead><TableHead>Obs.</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((r, i) => renderRow(r, i, true))}</TableBody>
        </Table>
      )}
    </ReportShell>
  );
}
