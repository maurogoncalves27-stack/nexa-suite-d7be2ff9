import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
  PieChart, Pie, Cell, LabelList,
} from "recharts";
import { fmtBRL } from "@/lib/dre";
import { FileSpreadsheet, Plus, TrendingUp } from "lucide-react";
import { ManualRevenueDialog } from "@/components/faturamento/ManualRevenueDialog";

const DailyAnalytics = lazy(() =>
  import("@/components/faturamento/DailyAnalytics").then(m => ({ default: m.DailyAnalytics }))
);
const CurrentMonthVs3Panel = lazy(() =>
  import("@/components/faturamento/CurrentMonthVs3Panel")
);

interface Store { id: string; name: string }
interface Brand { id: string; name: string; color?: string | null }
interface Row {
  id: string;
  year: number;
  month: number;
  store_id: string | null;
  brand_id: string | null;
  gross_revenue: number;
  is_consolidated?: boolean;
}

// Total real por (year, month): se houver consolidado, usa ele; senão soma detalhado
function monthTotal(rows: Row[], year: number, month: number): number {
  const cons = rows.find(r => r.year === year && r.month === month && r.is_consolidated);
  if (cons) return cons.gross_revenue;
  return rows.filter(r => r.year === year && r.month === month && !r.is_consolidated)
    .reduce((a, r) => a + r.gross_revenue, 0);
}

function consolidatedMonthTotal(rows: Row[], year: number, month: number): number | null {
  const cons = rows.find(r => r.year === year && r.month === month && r.is_consolidated);
  return cons && cons.gross_revenue > 0 ? cons.gross_revenue : null;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const BRAND_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 142 71% 45%))", "hsl(var(--chart-3, 35 91% 55%))", "hsl(var(--chart-4, 280 65% 60%))"];

// Cores fixas por marca (usadas nos rótulos do eixo X)
const BRAND_LABEL_COLORS: { match: RegExp; color: string }[] = [
  { match: /estrogonofe/i, color: "#7a3b16" }, // marrom
  { match: /box/i,         color: "#ea7a2c" }, // laranja
  { match: /aquela parme|aquela parmê/i, color: "#b91c1c" }, // vermelho
];
function brandLabelColor(name: string): string {
  const hit = BRAND_LABEL_COLORS.find(b => b.match.test(name));
  return hit?.color ?? "hsl(var(--foreground))";
}

// Cores fixas por loja (sobrescreve o ciclo padrão)
function storeColor(name: string, fallback: string): string {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/asa\s*norte/.test(n))     return "#16a34a"; // verde
  if (/aguas\s*claras/.test(n))  return "#2563eb"; // azul
  if (/asa\s*sul/.test(n))       return "#eab308"; // amarelo
  if (/lago\s*sul/.test(n))      return "#ec4899"; // rosa
  return fallback;
}

// Cores fixas por marca (preenchimento de barras)
function brandFillColor(name: string, fallback: string): string {
  const hit = BRAND_LABEL_COLORS.find(b => b.match.test(name));
  return hit?.color ?? fallback;
}

// Tick customizado do eixo X (marcas) com cor + fonte maior
const abbrev = (s: string) => {
  if (typeof window === "undefined") return s;
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  if (!isMobile) return s;
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return parts.map((p) => p[0]).join("").slice(0, 4).toUpperCase();
  return s.slice(0, 4).toUpperCase();
};

const BrandTick = (props: any) => {
  const { x, y, payload } = props;
  const label = String(payload?.value ?? "");
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill={brandLabelColor(label)}
      className="sm:[font-size:14px]"
    >
      {abbrev(label)}
    </text>
  );
};

const StoreTick = (props: any) => {
  const { x, y, payload } = props;
  const label = String(payload?.value ?? "");
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill={storeColor(label, "hsl(var(--foreground))")}
      className="sm:[font-size:14px]"
    >
      {abbrev(label)}
    </text>
  );
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

interface OwnSale {
  sold_at: string;
  total_amount: number;
  store_id: string | null;
  brand_id: string | null;
  is_ifood: boolean;
}

export default function Faturamento() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [ownSales, setOwnSales] = useState<OwnSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  async function load() {
    setLoading(true);
    try {
      // Fonte: monthly_revenue (alimentada por daily_revenue via trigger).
      // Busca paginada por ano em paralelo para não deixar a tela presa no skeleton.
      const currentYear = new Date().getFullYear();
      // Inclui de 2023 (primeiro ano com dados consolidados mensais) até o ano atual
      const EARLIEST_YEAR = 2023;
      const targetYears: number[] = [];
      for (let y = currentYear; y >= EARLIEST_YEAR; y--) targetYears.push(y);
      const COLS = "id,year,month,store_id,brand_id,gross_revenue,is_consolidated";
      const step = 1000;

      const fetchYearRows = async (targetYear: number) => {
        const yearRows: any[] = [];
        for (let page = 0; page < 20; page++) {
          const from = page * step;
          const { data, error } = await supabase
            .from("monthly_revenue")
            .select(COLS)
            .eq("year", targetYear)
            .order("month")
            .range(from, from + step - 1);

          if (error) throw error;
          yearRows.push(...(data ?? []));
          if (!data || data.length < step) break;
        }
        return yearRows;
      };

      const [s, b] = await Promise.all([
        supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
        supabase.from("brands").select("id,name").order("name"),
      ]);

      if (s.data) setStores(s.data as Store[]);
      if (b.data) setBrands(b.data as Brand[]);

      const yearGroups = await Promise.all(targetYears.map(fetchYearRows));

      const all = yearGroups.flat();
      setRows(all.map(x => ({ ...x, gross_revenue: Number(x.gross_revenue) })));
      setOwnSales([]);
    } catch (e: any) {
      console.error("Erro ao carregar faturamento", e);
      toast({ title: "Erro ao carregar faturamento", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Filtra lojas operacionais (sem ESCRITÓRIO/FÁBRICA/ESTOQUE)
  const operationalStores = useMemo(
    () => stores.filter(s => !/escrit|fabri|estoque/i.test(s.name)),
    [stores]
  );

  const years = useMemo(() => {
    const set = new Set(rows.map(r => r.year));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  // KPIs (usa total real do mês — consolidado quando existir)
  const kpis = useMemo(() => {
    const monthsSet = new Set<number>();
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const v = monthTotal(rows, year, m);
      if (v > 0) { monthsSet.add(m); total += v; }
    }
    return { total, months: monthsSet.size, avg: monthsSet.size ? total / monthsSet.size : 0 };
  }, [rows, year]);

  // Linhas detalhadas (sem consolidado) do ano selecionado
  const detailRows = useMemo(
    () => rows.filter(r => r.year === year && !r.is_consolidated && r.store_id),
    [rows, year]
  );

  // Marcas de produto (exclui FÁBRICA, TOTEM e SALÃO — esses são canais
  // usados apenas em Vendas Próprias).
  const productBrands = useMemo(
    () => brands.filter(b => !/fabri|totem|salao/i.test(normalize(b.name))),
    [brands]
  );

  // Barras agrupadas: loja × marca (só com dados detalhados)
  const barData = useMemo(() => {
    return operationalStores.map(s => {
      const item: any = { store: s.name };
      for (const b of productBrands) {
        item[b.name] = detailRows
          .filter(r => r.store_id === s.id && r.brand_id === b.id)
          .reduce((acc, r) => acc + r.gross_revenue, 0);
      }
      return item;
    });
  }, [operationalStores, productBrands, detailRows]);

  // Barras agrupadas invertidas: marca × loja
  const brandByStoreData = useMemo(() => {
    return productBrands.map(b => {
      const item: any = { brand: b.name };
      for (const s of operationalStores) {
        item[s.name] = detailRows
          .filter(r => r.brand_id === b.id && r.store_id === s.id)
          .reduce((acc, r) => acc + r.gross_revenue, 0);
      }
      return item;
    });
  }, [operationalStores, productBrands, detailRows]);

  // Linha mensal do ano — quebra no último mês fechado (não inclui o mês corrente em andamento)
  const lineData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1..12
    return MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      // Para o ano corrente: só meses já encerrados (m < currentMonth). Anos passados: todos.
      if (year === currentYear && m >= currentMonth) return { label, total: null };
      const v = monthTotal(rows, year, m);
      return { label, total: v > 0 ? v : null };
    });
  }, [rows, year]);

  // Comparativo anual (com projeção empilhada para o ano corrente)
  const yearComparison = useMemo(() => {
    const CURRENT = new Date().getFullYear();
    const PREV = CURRENT - 1;
    // Crescimento YoY observado YTD para projetar meses faltantes do ano corrente
    let lastRealizedMonth = 0;
    let sumCur = 0, sumPrev = 0;
    for (let m = 1; m <= 12; m++) {
      const v = monthTotal(rows, CURRENT, m);
      if (v > 0) {
        lastRealizedMonth = m;
        const p = monthTotal(rows, PREV, m);
        if (p > 0) { sumCur += v; sumPrev += p; }
      }
    }
    const growth = sumPrev > 0 ? (sumCur / sumPrev) - 1 : 0;

    return years.slice().sort((a, b) => a - b).map(y => {
      let realizado = 0;
      let projetado = 0;
      for (let m = 1; m <= 12; m++) {
        const v = monthTotal(rows, y, m);
        realizado += v;
        if (y === CURRENT && m > lastRealizedMonth) {
          const prev = monthTotal(rows, PREV, m);
          if (prev > 0) projetado += prev * (1 + growth);
        }
      }
      return { year: String(y), realizado, projetado, total: realizado + projetado };
    }).filter(d => d.total > 0);
  }, [rows, years]);

  // Comparativo mensal entre anos (com projeção para o ano corrente)
  const monthlyByYear = useMemo(() => {
    const CURRENT = new Date().getFullYear();
    const PREV = CURRENT - 1;
    const yrs = years.slice().sort((a, b) => a - b).filter(y =>
      MONTH_LABELS.some((_, i) => consolidatedMonthTotal(rows, y, i + 1) !== null)
    );

    // Último mês consolidado do ano corrente
    let lastRealizedMonth = 0;
    for (let m = 1; m <= 12; m++) {
      if (consolidatedMonthTotal(rows, CURRENT, m) !== null) lastRealizedMonth = m;
    }

    // Crescimento YoY observado YTD
    let sumCur = 0, sumPrev = 0;
    for (let m = 1; m <= lastRealizedMonth; m++) {
      const cur = monthTotal(rows, CURRENT, m);
      const prev = monthTotal(rows, PREV, m);
      if (prev > 0) { sumCur += cur; sumPrev += prev; }
    }
    const growth = sumPrev > 0 ? (sumCur / sumPrev) - 1 : 0;

    const projectionKey = `${CURRENT} projetado`;
    const hasCurrent = yrs.includes(CURRENT);

    const data = MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const item: any = { label };
      yrs.forEach(y => { item[String(y)] = consolidatedMonthTotal(rows, y, i + 1); });

      if (hasCurrent && m > lastRealizedMonth) {
        const prev = monthTotal(rows, PREV, m);
        const projected = prev > 0 ? prev * (1 + growth) : 0;
        if (projected > 0) {
          item[projectionKey] = projected;
        }
      }

      return item;
    });

    return { years: yrs, data, hasCurrent, currentYear: CURRENT, projectionKey };
  }, [rows, years]);

  // Projeção 2026 baseada em 2025 + crescimento observado YTD
  // "Realizado" só conta meses já ENCERRADOS (anteriores ao mês corrente). O mês em
  // andamento entra como projetado até virar o mês.
  const projection2026 = useMemo(() => {
    const TARGET = 2026;
    const PREV = 2025;
    const now = new Date();
    const lastClosedMonth = now.getFullYear() > TARGET ? 12
      : now.getFullYear() < TARGET ? 0
      : now.getMonth(); // mês anterior ao corrente (0 se janeiro)

    const realized: Array<{ month: number; value: number }> = [];
    let lastRealizedMonth = 0;
    for (let m = 1; m <= lastClosedMonth; m++) {
      const v = monthTotal(rows, TARGET, m);
      if (v > 0) { realized.push({ month: m, value: v }); lastRealizedMonth = m; }
    }
    // Crescimento YoY observado (apenas meses com dado nos dois anos)
    let sumCur = 0, sumPrev = 0;
    realized.forEach(r => {
      const p = monthTotal(rows, PREV, r.month);
      if (p > 0) { sumCur += r.value; sumPrev += p; }
    });
    const growth = sumPrev > 0 ? (sumCur / sumPrev) - 1 : 0;

    const data = MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const real = m <= lastRealizedMonth ? monthTotal(rows, TARGET, m) : 0;
      const prev = monthTotal(rows, PREV, m);
      const projected = m > lastRealizedMonth && prev > 0 ? prev * (1 + growth) : 0;
      const isFirstProjected = m === lastRealizedMonth + 1 && projected > 0;
      return {
        label,
        realizado: real > 0 ? real : (isFirstProjected ? projected : null),
        projetado: projected > 0 ? projected : null,
        ano2025: prev > 0 ? prev : null,
      };
    });

    const totalRealizado = realized.reduce((a, r) => a + r.value, 0);
    const totalProjetado = data.reduce((a, d) => a + (d.projetado || 0), 0);
    const totalAno = totalRealizado + totalProjetado;
    const total2025 = (() => { let t = 0; for (let m = 1; m <= 12; m++) t += monthTotal(rows, PREV, m); return t; })();
    const yoy = total2025 > 0 ? (totalAno / total2025) - 1 : 0;

    return { data, totalRealizado, totalProjetado, totalAno, total2025, growth, yoy, lastRealizedMonth };
  }, [rows]);

  // Tabela mensal
  const monthlyTable = useMemo(() => {
    return MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const cells: Record<string, number> = {};
      for (const s of operationalStores) {
        cells[s.id] = detailRows
          .filter(r => r.month === m && r.store_id === s.id)
          .reduce((a, r) => a + r.gross_revenue, 0);
      }
      const total = monthTotal(rows, year, m);
      const detailSum = Object.values(cells).reduce((a, v) => a + v, 0);
      return { month: m, label, cells, total, isConsolidatedOnly: total > 0 && detailSum === 0 };
    });
  }, [operationalStores, detailRows, rows, year]);

  // Helpers para classificar marcas
  const brandById = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach(b => m.set(b.id, b.name));
    return m;
  }, [brands]);
  const isOwnChannel = (brandId: string | null) => {
    if (!brandId) return false;
    const n = normalize(brandById.get(brandId) || "");
    return /totem|salao/.test(n);
  };
  const isIfoodChannel = (brandId: string | null) => {
    if (!brandId) return false;
    const n = normalize(brandById.get(brandId) || "");
    // iFood = marcas de produto (Parmê, Estrogonofe, Box). Exclui Fábrica.
    if (/fabri/.test(n)) return false;
    return /parme|estrogonofe|box/.test(n);
  };
  const channelOf = (brandId: string | null): "totem" | "salao" | "ifood" | null => {
    if (!brandId) return null;
    const n = normalize(brandById.get(brandId) || "");
    if (/totem/.test(n)) return "totem";
    if (/salao/.test(n)) return "salao";
    if (/parme|estrogonofe|box/.test(n)) return "ifood";
    return null;
  };

  // Vendas próprias (TOTEM + SALÃO) — do ano selecionado
  const ownSalesData = useMemo(() => {
    const filtered = detailRows.filter(r => isOwnChannel(r.brand_id));
    const total = filtered.reduce((a, r) => a + r.gross_revenue, 0);

    const monthly = MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const ofMonth = filtered.filter(r => r.month === m);
      const totem = ofMonth.filter(r => channelOf(r.brand_id) === "totem").reduce((a, r) => a + r.gross_revenue, 0);
      const salao = ofMonth.filter(r => channelOf(r.brand_id) === "salao").reduce((a, r) => a + r.gross_revenue, 0);
      return { label, totem, salao, total: totem + salao };
    });

    const totalTotem = monthly.reduce((a, m) => a + m.totem, 0);
    const totalSalao = monthly.reduce((a, m) => a + m.salao, 0);

    // Por loja
    const byStore = operationalStores.map(s => {
      const totem = filtered.filter(r => r.store_id === s.id && channelOf(r.brand_id) === "totem").reduce((a, r) => a + r.gross_revenue, 0);
      const salao = filtered.filter(r => r.store_id === s.id && channelOf(r.brand_id) === "salao").reduce((a, r) => a + r.gross_revenue, 0);
      return { store: s.name, totem, salao, total: totem + salao };
    }).filter(s => s.total > 0);

    return { total, totalTotem, totalSalao, monthly, byStore };
  }, [detailRows, brandById, operationalStores]);

  // Comparativo Próprias × iFood (mensal) — separa Totem e Salão para empilhar
  const ownVsIfood = useMemo(() => {
    const monthly = MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const ofMonth = detailRows.filter(r => r.month === m);
      const totem = ofMonth.filter(r => channelOf(r.brand_id) === "totem").reduce((a, r) => a + r.gross_revenue, 0);
      const salao = ofMonth.filter(r => channelOf(r.brand_id) === "salao").reduce((a, r) => a + r.gross_revenue, 0);
      const proprio = totem + salao;
      const ifood = ofMonth.filter(r => isIfoodChannel(r.brand_id)).reduce((a, r) => a + r.gross_revenue, 0);
      return { label, totem, salao, proprio, ifood, total: proprio + ifood };
    });
    const totalProprio = monthly.reduce((a, m) => a + m.proprio, 0);
    const totalIfood = monthly.reduce((a, m) => a + m.ifood, 0);
    const total = totalProprio + totalIfood;
    const pctProprio = total > 0 ? (totalProprio / total) * 100 : 0;
    const pctIfood = total > 0 ? (totalIfood / total) * 100 : 0;
    return { monthly, totalProprio, totalIfood, total, pctProprio, pctIfood };
  }, [detailRows, brandById]);

  // Comparativo por loja (Próprias × iFood) no ano selecionado
  const ownVsIfoodByStore = useMemo(() => {
    return operationalStores.map(s => {
      const proprio = detailRows.filter(r => r.store_id === s.id && isOwnChannel(r.brand_id)).reduce((a, r) => a + r.gross_revenue, 0);
      const ifood = detailRows.filter(r => r.store_id === s.id && isIfoodChannel(r.brand_id)).reduce((a, r) => a + r.gross_revenue, 0);
      return { store: s.name, proprio, ifood, total: proprio + ifood };
    }).filter(x => x.total > 0);
  }, [detailRows, brandById, operationalStores]);

  const [manualOpen, setManualOpen] = useState(false);


  return (
    <div className="space-y-6 p-3 sm:p-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Faturamento bruto
        </h1>
        <p className="text-muted-foreground">Receita por loja, marca e canal de venda — consolidado mensal.</p>
      </div>
      {loading && rows.length === 0 && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Carregando faturamento...
        </div>
      )}
      {/* Header / filtros */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">

        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="outline">{kpis.months} {kpis.months === 1 ? "mês" : "meses"} com dados</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Lançar manual
          </Button>
        </div>
      </div>

      <ManualRevenueDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        stores={operationalStores}
        brands={brands}
        defaultYear={year}
        onSaved={load}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total {year}</div><div className="text-lg sm:text-xl font-semibold">{fmtBRL(kpis.total)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Média mensal</div><div className="text-lg sm:text-xl font-semibold">{fmtBRL(kpis.avg)}</div></CardContent></Card>
        <Card className="col-span-2 sm:col-span-1"><CardContent className="p-3"><div className="text-xs text-muted-foreground">Lojas × marcas</div><div className="text-lg sm:text-xl font-semibold">{operationalStores.length} × {productBrands.length}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="comparativo">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="comparativo">Loja × Marca</TabsTrigger>
          <TabsTrigger value="mes-corrente">Mês corrente × 3 últimos</TabsTrigger>
          <TabsTrigger value="anual">Comparativo anual</TabsTrigger>
          <TabsTrigger value="projecao">Projeção 2026</TabsTrigger>
          <TabsTrigger value="marca-loja">Marca × Loja</TabsTrigger>
          <TabsTrigger value="proprias">Vendas próprias</TabsTrigger>
          <TabsTrigger value="tabela">Tabela mensal</TabsTrigger>
          <TabsTrigger value="diarias">Análises diárias</TabsTrigger>
        </TabsList>

        <TabsContent value="mes-corrente">
          <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
            <CurrentMonthVs3Panel stores={operationalStores} storeColor={storeColor} />
          </Suspense>
        </TabsContent>




        <TabsContent value="comparativo">
          <Card>
            <CardHeader><CardTitle className="text-base">Faturamento bruto {year} — barras agrupadas por loja</CardTitle></CardHeader>
            <CardContent>
              {barData.every(d => productBrands.every(b => !d[b.name])) ? (
                <div className="text-center text-muted-foreground py-12">
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  Sem dados para {year}. Importe a planilha pelo botão acima.
                </div>
              ) : (
                <div className="h-[380px] sm:h-[420px] w-full">
                  <ResponsiveContainer>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="store" interval={0} tick={<StoreTick />} height={40} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                      <Legend />
                      {productBrands.map((b, i) => (
                        <Bar
                          key={b.id}
                          dataKey={b.name}
                          fill={brandFillColor(b.name, BRAND_COLORS[i % BRAND_COLORS.length])}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marca-loja">
          <Card>
            <CardHeader><CardTitle className="text-base">Faturamento bruto {year} — barras agrupadas por marca</CardTitle></CardHeader>
            <CardContent>
              {brandByStoreData.every(d => operationalStores.every(s => !d[s.name])) ? (
                <div className="text-center text-muted-foreground py-12">
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  Sem dados para {year}.
                </div>
              ) : (
                <div className="h-[380px] sm:h-[420px] w-full">
                  <ResponsiveContainer>
                    <BarChart data={brandByStoreData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="brand" interval={0} tick={<BrandTick />} height={40} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                      <Legend />
                      {operationalStores.map((s, i) => (
                        <Bar key={s.id} dataKey={s.name} fill={storeColor(s.name, BRAND_COLORS[i % BRAND_COLORS.length])} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anual">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Faturamento total por ano</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px] w-full">
                  <ResponsiveContainer>
                    <BarChart data={yearComparison}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <RTooltip formatter={(v: any, n: any) => [fmtBRL(Number(v)), n === "projetado" ? "Projetado" : "Realizado"]} />
                      <Legend />
                      <Bar dataKey="realizado" name="Realizado" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="projetado" name="Projetado" stackId="a" fill="hsl(var(--primary) / 0.35)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Mês a mês — comparativo entre anos</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px] w-full">
                  <ResponsiveContainer>
                    <LineChart data={monthlyByYear.data}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                      <Legend />
                      {monthlyByYear.years.map((y, i) => (
                        <Line key={y} type="monotone" dataKey={String(y)} stroke={BRAND_COLORS[i % BRAND_COLORS.length]} strokeWidth={2} dot />
                      ))}
                      {monthlyByYear.hasCurrent && (
                        <Line type="monotone" dataKey={monthlyByYear.projectionKey} name={`${monthlyByYear.currentYear} projetado`} stroke={BRAND_COLORS[monthlyByYear.years.indexOf(monthlyByYear.currentYear) % BRAND_COLORS.length]} strokeWidth={2} strokeDasharray="5 5" dot />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projecao">
          <div className="grid gap-3">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Realizado YTD</div><div className="text-lg font-semibold">{fmtBRL(projection2026.totalRealizado)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Projetado restante</div><div className="text-lg font-semibold">{fmtBRL(projection2026.totalProjetado)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total estimado 2026</div><div className="text-lg font-semibold">{fmtBRL(projection2026.totalAno)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">vs 2025</div><div className={`text-lg font-semibold ${projection2026.yoy >= 0 ? "text-emerald-600" : "text-destructive"}`}>{(projection2026.yoy * 100).toFixed(1)}%</div></CardContent></Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Projeção 2026 — realizado + estimativa</CardTitle>
                <div className="text-xs text-muted-foreground">
                  Base: 2025 ajustado pelo crescimento médio observado YTD ({(projection2026.growth * 100).toFixed(1)}%).
                  Meses 1–{projection2026.lastRealizedMonth} são reais; demais são projetados.
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[380px] sm:h-[420px] w-full">
                  <ResponsiveContainer>
                    <LineChart data={projection2026.data}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                      <Legend />
                      <Line type="monotone" dataKey="ano2025" name="2025" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="realizado" name="2026 realizado" stroke="hsl(var(--primary))" strokeWidth={2.5} dot />
                      <Line type="monotone" dataKey="projetado" name="2026 projetado" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Detalhamento mensal</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-3">Mês</th>
                      <th className="py-2 pr-3 text-right">2025</th>
                      <th className="py-2 pr-3 text-right">2026 realizado</th>
                      <th className="py-2 pr-3 text-right">2026 projetado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection2026.data.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3">{d.label}</td>
                        <td className="py-2 pr-3 text-right">{d.ano2025 ? fmtBRL(d.ano2025) : "—"}</td>
                        <td className="py-2 pr-3 text-right">{d.realizado ? fmtBRL(d.realizado) : "—"}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground italic">{d.projetado ? fmtBRL(d.projetado) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-3">Total</td>
                      <td className="py-2 pr-3 text-right">{fmtBRL(projection2026.total2025)}</td>
                      <td className="py-2 pr-3 text-right">{fmtBRL(projection2026.totalRealizado)}</td>
                      <td className="py-2 pr-3 text-right">{fmtBRL(projection2026.totalProjetado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="proprias">
          <div className="grid gap-3">
            {/* KPIs canais próprios */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total próprias {year}</div>
                  <div className="text-lg sm:text-xl font-semibold">{fmtBRL(ownSalesData.total)}</div>
                </CardContent>
              </Card>
              <Card style={{ background: "hsl(210 40% 98%)" }}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Totem (4 lojas)</div>
                  <div className="text-lg sm:text-xl font-semibold">{fmtBRL(ownSalesData.totalTotem)}</div>
                </CardContent>
              </Card>
              <Card style={{ background: "hsl(142 50% 96%)" }}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Salão (Asa Norte)</div>
                  <div className="text-lg sm:text-xl font-semibold">{fmtBRL(ownSalesData.totalSalao)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">% sobre o total</div>
                  <div className="text-lg sm:text-xl font-semibold">{ownVsIfood.pctProprio.toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">vs. iFood ({ownVsIfood.pctIfood.toFixed(1)}%)</div>
                </CardContent>
              </Card>
            </div>

            {/* Mensal — Totem + Salão empilhados (com % do mês) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vendas próprias por mês — {year}</CardTitle>
                <div className="text-xs text-muted-foreground">Totem (4 lojas) + Salão (apenas Asa Norte). Rótulos = % do mês.</div>
              </CardHeader>
              <CardContent>
                {ownSalesData.total === 0 ? (
                  <div className="text-center text-muted-foreground py-12">Sem vendas próprias registradas em {year}.</div>
                ) : (
                  <div className="h-[340px] sm:h-[380px] w-full">
                    <ResponsiveContainer>
                      <BarChart data={ownSalesData.monthly}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                        <RTooltip formatter={(v: any, n: any, p: any) => {
                          const total = (p?.payload?.totem || 0) + (p?.payload?.salao || 0);
                          const pct = total > 0 ? ((Number(v) / total) * 100).toFixed(1) : "0";
                          return [`${fmtBRL(Number(v))} (${pct}%)`, n];
                        }} />
                        <Legend />
                        <Bar dataKey="totem" stackId="a" name="Totem" fill="hsl(210 80% 55%)">
                          <LabelList
                            dataKey="totem"
                            position="center"
                            content={(props: any) => {
                              const { x, y, width, height, value, index } = props;
                              const row = ownSalesData.monthly[index];
                              const tot = (row?.totem || 0) + (row?.salao || 0);
                              if (!tot || !value || height < 16) return null;
                              const pct = ((value / tot) * 100).toFixed(0);
                              return <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">{pct}%</text>;
                            }}
                          />
                        </Bar>
                        <Bar dataKey="salao" stackId="a" name="Salão" fill="hsl(142 65% 45%)" radius={[4, 4, 0, 0]}>
                          <LabelList
                            dataKey="salao"
                            position="center"
                            content={(props: any) => {
                              const { x, y, width, height, value, index } = props;
                              const row = ownSalesData.monthly[index];
                              const tot = (row?.totem || 0) + (row?.salao || 0);
                              if (!tot || !value || height < 16) return null;
                              const pct = ((value / tot) * 100).toFixed(0);
                              return <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">{pct}%</text>;
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comparativo Próprias × iFood (mensal, com % do mês) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vendas próprias × iFood — {year}</CardTitle>
                <div className="text-xs text-muted-foreground">
                  Próprias = Totem + Salão. iFood = Aquela Parmê + Aquele Estrogonofe + Box Caipira. Rótulos = % do mês.
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
                  <Card className="bg-primary/5 border-primary/30">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">Vendas próprias</div>
                      <div className="text-lg sm:text-xl font-semibold">{fmtBRL(ownVsIfood.totalProprio)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{ownVsIfood.pctProprio.toFixed(1)}% do total</div>
                    </CardContent>
                  </Card>
                  <Card style={{ background: "hsl(14 100% 96%)", borderColor: "hsl(14 100% 60% / 0.4)" }}>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">iFood</div>
                      <div className="text-lg sm:text-xl font-semibold" style={{ color: "hsl(4 75% 45%)" }}>
                        {fmtBRL(ownVsIfood.totalIfood)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{ownVsIfood.pctIfood.toFixed(1)}% do total</div>
                    </CardContent>
                  </Card>
                  <Card className="col-span-2 sm:col-span-1">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">Total geral</div>
                      <div className="text-lg sm:text-xl font-semibold">{fmtBRL(ownVsIfood.total)}</div>
                    </CardContent>
                  </Card>
                </div>
                {ownVsIfood.total === 0 ? (
                  <div className="text-center text-muted-foreground py-8">Sem vendas registradas em {year}.</div>
                ) : (
                  <div className="h-[360px] sm:h-[400px] w-full">
                    <ResponsiveContainer>
                      <BarChart data={ownVsIfood.monthly} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                        <RTooltip formatter={(v: any, n: any, p: any) => {
                          const tot = (p?.payload?.proprio || 0) + (p?.payload?.ifood || 0);
                          const pct = tot > 0 ? ((Number(v) / tot) * 100).toFixed(1) : "0";
                          return [`${fmtBRL(Number(v))} (${pct}%)`, n];
                        }} />
                        <Legend />
                        <Bar dataKey="totem" stackId="proprio" name="Totem" fill="hsl(210 80% 55%)" />
                        <Bar dataKey="salao" stackId="proprio" name="Salão" fill="hsl(142 65% 45%)" radius={[4, 4, 0, 0]}>
                          <LabelList
                            position="top"
                            content={(props: any) => {
                              const { x, y, width, index } = props;
                              const row = ownVsIfood.monthly[index];
                              const tot = (row?.proprio || 0) + (row?.ifood || 0);
                              if (!tot || !row?.proprio) return null;
                              const pct = ((row.proprio / tot) * 100).toFixed(0);
                              return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(var(--primary))">{pct}%</text>;
                            }}
                          />
                        </Bar>
                        <Bar dataKey="ifood" stackId="ifood" name="iFood" fill="hsl(4 75% 50%)" radius={[4, 4, 0, 0]}>
                          <LabelList
                            position="top"
                            content={(props: any) => {
                              const { x, y, width, value, index } = props;
                              const row = ownVsIfood.monthly[index];
                              const tot = (row?.proprio || 0) + (row?.ifood || 0);
                              if (!tot || !value) return null;
                              const pct = ((value / tot) * 100).toFixed(0);
                              return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="hsl(4 75% 45%)">{pct}%</text>;
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pizzas: distribuição anual */}
            <div className="grid gap-3 md:grid-cols-2">
              {/* Pizza Próprias × iFood */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Próprias × iFood — {year}</CardTitle>
                  <div className="text-xs text-muted-foreground">Distribuição do faturamento anual.</div>
                </CardHeader>
                <CardContent>
                  {ownVsIfood.total === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem dados.</div>
                  ) : (
                    <div className="h-[320px] sm:h-[360px] w-full">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Próprias", value: ownVsIfood.totalProprio, fill: "hsl(var(--primary))" },
                              { name: "iFood", value: ownVsIfood.totalIfood, fill: "hsl(4 75% 50%)" },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={100}
                            label={(e: any) => `${e.name}: ${((e.value / ownVsIfood.total) * 100).toFixed(1)}%`}
                            labelLine={false}
                          />
                          <RTooltip formatter={(v: any, n: any) => [`${fmtBRL(Number(v))} (${((Number(v) / ownVsIfood.total) * 100).toFixed(1)}%)`, n]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pizza Totem × Salão */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Mix dos canais próprios — {year}</CardTitle>
                  <div className="text-xs text-muted-foreground">Totem × Salão.</div>
                </CardHeader>
                <CardContent>
                  {ownSalesData.total === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem dados.</div>
                  ) : (
                    <div className="h-[320px] sm:h-[360px] w-full">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Totem", value: ownSalesData.totalTotem, fill: "hsl(210 80% 55%)" },
                              { name: "Salão", value: ownSalesData.totalSalao, fill: "hsl(142 65% 45%)" },
                            ].filter(d => d.value > 0)}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={100}
                            label={(e: any) => `${e.name}: ${((e.value / ownSalesData.total) * 100).toFixed(1)}%`}
                            labelLine={false}
                          />
                          <RTooltip formatter={(v: any, n: any) => [`${fmtBRL(Number(v))} (${((Number(v) / ownSalesData.total) * 100).toFixed(1)}%)`, n]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pizza Próprias por loja */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Próprias por loja — {year}</CardTitle>
                </CardHeader>
                <CardContent>
                  {ownSalesData.byStore.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem dados.</div>
                  ) : (
                    <div className="h-[320px] sm:h-[360px] w-full">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={ownSalesData.byStore.map(s => ({ name: s.store, value: s.total, fill: storeColor(s.store, "hsl(var(--primary))") }))}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={100}
                            label={(e: any) => `${((e.value / ownSalesData.total) * 100).toFixed(1)}%`}
                            labelLine={false}
                          />
                          <RTooltip formatter={(v: any, n: any) => [`${fmtBRL(Number(v))} (${((Number(v) / ownSalesData.total) * 100).toFixed(1)}%)`, n]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pizza Próprias × iFood por loja: % de canal próprio em cada loja, mostrado em pie do total geral */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Mix Próprias × iFood por loja — {year}</CardTitle>
                  <div className="text-xs text-muted-foreground">% de canais próprios sobre o total da loja.</div>
                </CardHeader>
                <CardContent>
                  {ownVsIfoodByStore.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem dados.</div>
                  ) : (
                    <div className="space-y-2">
                      {ownVsIfoodByStore.map(s => {
                        const pct = s.total > 0 ? (s.proprio / s.total) * 100 : 0;
                        return (
                          <div key={s.store} className="flex items-center gap-3">
                            <div className="w-28 text-sm font-medium" style={{ color: storeColor(s.store, "inherit") }}>{s.store}</div>
                            <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden flex">
                              <div className="h-full flex items-center justify-end px-2 text-[10px] font-semibold text-white" style={{ width: `${pct}%`, background: "hsl(var(--primary))" }}>
                                {pct >= 8 ? `${pct.toFixed(0)}%` : ""}
                              </div>
                              <div className="h-full flex items-center justify-start px-2 text-[10px] font-semibold text-white" style={{ width: `${100 - pct}%`, background: "hsl(4 75% 50%)" }}>
                                {(100 - pct) >= 8 ? `${(100 - pct).toFixed(0)}%` : ""}
                              </div>
                            </div>
                            <div className="w-28 text-right text-xs text-muted-foreground">{fmtBRL(s.total)}</div>
                          </div>
                        );
                      })}
                      <div className="flex gap-3 pt-2 text-xs">
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(var(--primary))" }} /> Próprias</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(4 75% 50%)" }} /> iFood</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tabela">
          <Card>
            <CardHeader><CardTitle className="text-base">Bruto mensal por loja — {year}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Mês</th>
                    {operationalStores.map(s => (
                      <th key={s.id} className="py-2 pr-3 text-right">{s.name}</th>
                    ))}
                    <th className="py-2 pr-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTable.map(row => (
                    <tr key={row.month} className="border-b last:border-0">
                      <td className="py-2 pr-3">{row.label}</td>
                      {operationalStores.map(s => (
                        <td key={s.id} className="py-2 pr-3 text-right">{row.cells[s.id] ? fmtBRL(row.cells[s.id]) : "—"}</td>
                      ))}
                      <td className="py-2 pr-3 text-right font-semibold">{row.total ? fmtBRL(row.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-3">Total</td>
                    {operationalStores.map(s => {
                      const t = detailRows.filter(r => r.store_id === s.id).reduce((a, r) => a + r.gross_revenue, 0);
                      return <td key={s.id} className="py-2 pr-3 text-right">{t ? fmtBRL(t) : "—"}</td>;
                    })}
                    <td className="py-2 pr-3 text-right">{fmtBRL(kpis.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diarias">
          <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
            <DailyAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
