/**
 * Impressora simulada para evidências de homologação PayGo C6.
 *
 * Renderiza, em formato "rolo de papel" 40 colunas, o texto do cupom
 * exatamente como veio da PGWebLib (campos customerReceipt / merchantReceipt /
 * cupom reduzido / diferenciados). Permite exportar como TXT ou PDF para
 * anexar como evidência ao roteiro Setis.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, FileText, Trash2, FolderArchive } from "lucide-react";
import { clearTefReceipts, useTefReceipts, type TefReceiptEntry } from "@/hooks/useTefReceipts";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";

type ViaKey = "merchant" | "customer" | "reduced" | "diff1" | "diff2";

const VIA_LABEL: Record<ViaKey, string> = {
  merchant: "Estabelecimento",
  customer: "Cliente",
  reduced: "Reduzido",
  diff1: "Diferenciado 1",
  diff2: "Diferenciado 2",
};

const pickText = (entry: TefReceiptEntry | undefined, via: ViaKey): string => {
  if (!entry) return "";
  return (entry[via] ?? "").trim();
};

const fmtTs = (ts: number) => new Date(ts).toLocaleString("pt-BR");

const buildFilename = (entry: TefReceiptEntry, via: ViaKey, ext: string) => {
  const safe = entry.label.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "cupom";
  const stamp = new Date(entry.ts).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `paygo_${safe}_${via}_${stamp}.${ext}`;
};

const downloadTxt = (entry: TefReceiptEntry, via: ViaKey, text: string) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildFilename(entry, via, "txt");
  a.click();
  URL.revokeObjectURL(url);
};

const downloadPdf = (entry: TefReceiptEntry, via: ViaKey, text: string) => {
  const doc = new jsPDF({ unit: "mm", format: [80, 297] });
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  const lines = text.split(/\r?\n/);
  let y = 8;
  for (const ln of lines) {
    if (y > 285) { doc.addPage(); y = 8; }
    doc.text(ln || " ", 4, y);
    y += 4;
  }
  doc.save(buildFilename(entry, via, "pdf"));
};

const folderName = (entry: TefReceiptEntry) => {
  const safe = entry.label.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "cupom";
  const stamp = new Date(entry.ts).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${stamp}_${safe}`;
};

const downloadAllAsZip = async (entries: TefReceiptEntry[]) => {
  if (!entries.length) return;
  const zip = new JSZip();
  const root = zip.folder(`comprovantes-paygo-${new Date().toISOString().slice(0, 10)}`)!;
  for (const entry of entries) {
    const sub = root.folder(folderName(entry))!;
    (Object.keys(VIA_LABEL) as ViaKey[]).forEach((via) => {
      const text = pickText(entry, via);
      if (text) sub.file(`${via}.txt`, text);
    });
    // Resumo da transação
    const header = `Transação: ${entry.label}\nData: ${fmtTs(entry.ts)}\nID: ${entry.id}\n`;
    sub.file("_resumo.txt", header);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comprovantes-paygo-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};

export default function SimulatedPrinter() {
  const entries = useTefReceipts();
  const [via, setVia] = useState<ViaKey>("merchant");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const current = useMemo<TefReceiptEntry | undefined>(() => {
    if (!entries.length) return undefined;
    return entries.find((e) => e.id === selectedId) ?? entries[0];
  }, [entries, selectedId]);

  const text = pickText(current, via);
  const availableVias: ViaKey[] = current
    ? (Object.keys(VIA_LABEL) as ViaKey[]).filter((k) => !!pickText(current, k))
    : [];

  return (
    <Card className="p-4 h-full flex flex-col space-y-3">
      <div className="flex items-center gap-2 shrink-0">
        <Printer className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Impressora simulada</h2>
        <Badge variant="outline" className="ml-auto text-xs">
          {entries.length}/10 cupons
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground shrink-0">
        Renderiza o cupom devolvido pela PGWebLib. Use os botões abaixo para
        baixar como TXT ou PDF e anexar como evidência do passo do roteiro.
      </p>

      {!current ? (
        <div className="flex-1 flex items-center justify-center rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Nenhum cupom ainda. Rode uma venda de teste para gerar a primeira evidência.
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="flex flex-col min-h-0 gap-2">
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {availableVias.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={via === k ? "default" : "outline"}
                  onClick={() => setVia(k)}
                  className="h-7 text-xs"
                >
                  {VIA_LABEL[k]}
                </Button>
              ))}
              {availableVias.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  PdC não devolveu texto de cupom nesta transação.
                </span>
              )}
            </div>

            <pre
              className="flex-1 min-h-0 overflow-auto rounded border bg-background p-3 font-mono text-[11px] leading-tight whitespace-pre"
              style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}
            >
              {text || "(vazio)"}
            </pre>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                disabled={!text}
                onClick={() => downloadTxt(current, via, text)}
                className="gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" /> TXT
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!text}
                onClick={() => downloadPdf(current, via, text)}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!text}
                onClick={() => {
                  navigator.clipboard.writeText(text).then(() =>
                    toast({ title: "Cupom copiado" }),
                  );
                }}
              >
                Copiar texto
              </Button>
            </div>
          </div>

          <div className="flex flex-col min-h-0 gap-1.5">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-muted-foreground">Histórico</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { clearTefReceipts(); setSelectedId(null); }}
                className="h-6 px-1.5 text-xs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1">
              {entries.map((e) => {
                const active = e.id === current.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                      active ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium truncate">{e.label}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtTs(e.ts)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
