/**
 * Extrator de RecNum: lista últimas transações TEF da loja e gera
 * a planilha (TSV/CSV) que a Setis pede em PayGO_Web_Planilha_Recnum.xlsx.
 *
 * RecNum = REQNUM (PWINFO 0x32) — gravado pelo agente em raw_response.reqnum.
 * NSU = AUTEXTREF — coluna nsu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Copy, Download, FileSpreadsheet, ScrollText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props { storeId: string }

interface Row {
  finished_at: string;
  amount: number;
  status: string;
  nsu: string | null;
  authorization_code: string | null;
  reqnum: string | null;
  acquirer: string | null;
  raw_response: any;
}

const HEADER = ["Data", "Hora", "Valor", "Status", "RecNum (REQNUM)", "NSU", "Autorização", "Adquirente"];

export default function TefRecnumExtractor({ storeId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState("60");
  const [showLogs, setShowLogs] = useState(false);

  const load = async () => {
    if (!storeId) { setRows([]); return; }
    setLoading(true);
    const n = Math.max(1, Math.min(500, Number(limit) || 60));
    const { data, error } = await supabase
      .from("pdv_tef_transactions")
      .select("finished_at, amount, status, nsu, authorization_code, acquirer, raw_response")
      .eq("store_id", storeId)
      .order("finished_at", { ascending: false })
      .limit(n);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      return;
    }
    const parsed: Row[] = (data ?? []).map((r: any) => {
      const raw = r.raw_response ?? {};
      const reqnum =
        raw?.reqnum ?? raw?.REQNUM ?? raw?.recnum ?? raw?.recNum ??
        raw?.parsed?.reqnum ?? raw?.parsed?.REQNUM ?? null;
      return {
        finished_at: r.finished_at,
        amount: Number(r.amount ?? 0),
        status: r.status,
        nsu: r.nsu ?? null,
        authorization_code: r.authorization_code ?? null,
        reqnum: reqnum ? String(reqnum) : null,
        acquirer: r.acquirer ?? null,
      };
    });
    setRows(parsed);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [storeId]);

  const toTsv = () => {
    const lines = [HEADER.join("\t")];
    for (const r of rows) {
      const d = new Date(r.finished_at);
      lines.push([
        d.toLocaleDateString("pt-BR"),
        d.toLocaleTimeString("pt-BR"),
        r.amount.toFixed(2).replace(".", ","),
        r.status,
        r.reqnum ?? "",
        r.nsu ?? "",
        r.authorization_code ?? "",
        r.acquirer ?? "",
      ].join("\t"));
    }
    return lines.join("\n");
  };

  const copyTsv = async () => {
    if (rows.length === 0) {
      toast({ title: "Sem transações", description: "Rode pelo menos uma venda de teste antes." });
      return;
    }
    await navigator.clipboard.writeText(toTsv());
    toast({ title: "Copiado", description: `${rows.length} linha(s) prontas para colar na planilha Setis.` });
  };

  const downloadCsv = () => {
    if (rows.length === 0) return;
    const csv = toTsv().replace(/\t/g, ";");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paygo-recnum-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const withReqnum = rows.filter(r => r.reqnum).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Extrator de RecNum (planilha Setis)
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => setShowLogs(v => !v)}
          >
            <ScrollText className="h-3.5 w-3.5" />
            {showLogs ? "Ocultar logs" : "Ver logs PayGo"}
          </Button>
          <Badge variant={withReqnum > 0 ? "default" : "secondary"}>
            {withReqnum}/{rows.length} com RecNum
          </Badge>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Gera a lista de transações no formato que a Setis pede em
        <code className="mx-1 px-1 rounded bg-muted">PayGO_Web_Planilha_Recnum.xlsx</code>.
        Copie e cole direto na planilha, ou baixe como CSV.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Últimas N transações</label>
          <Input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-24 font-mono"
            type="number"
            min={1}
            max={500}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !storeId} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recarregar
        </Button>
        <Button size="sm" onClick={() => void copyTsv()} disabled={rows.length === 0} className="gap-2">
          <Copy className="h-4 w-4" /> Copiar p/ planilha
        </Button>
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={rows.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Baixar CSV
        </Button>
      </div>

      {!storeId ? (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          Selecione uma loja acima para carregar as transações.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          Nenhuma transação registrada. Use o card de <strong>Venda de teste</strong> acima
          para gerar RecNums.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                {HEADER.map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = new Date(r.finished_at);
                return (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    <td className="px-2 py-1 whitespace-nowrap">{d.toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{d.toLocaleTimeString("pt-BR")}</td>
                    <td className="px-2 py-1 font-mono whitespace-nowrap">{r.amount.toFixed(2).replace(".", ",")}</td>
                    <td className="px-2 py-1">
                      <Badge variant={r.status === "approved" ? "default" : "outline"} className="text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 font-mono whitespace-nowrap">
                      {r.reqnum ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1 font-mono whitespace-nowrap">{r.nsu ?? "—"}</td>
                    <td className="px-2 py-1 font-mono whitespace-nowrap">{r.authorization_code ?? "—"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{r.acquirer ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showLogs && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            Logs brutos PayGo (raw_response)
          </h3>
          {rows.length === 0 ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              Nenhuma transação para exibir logs.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.map((r, i) => {
                const raw = (r as any).raw_response ?? {};
                return (
                  <div key={i} className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                      <span className="font-mono text-muted-foreground">
                        {new Date(r.finished_at).toLocaleString("pt-BR")}
                      </span>
                      <span className="font-mono">R$ {r.amount.toFixed(2).replace(".", ",")}</span>
                      {r.reqnum && <span className="font-mono text-primary">RecNum: {r.reqnum}</span>}
                    </div>
                    <pre className="text-[11px] bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(raw, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
