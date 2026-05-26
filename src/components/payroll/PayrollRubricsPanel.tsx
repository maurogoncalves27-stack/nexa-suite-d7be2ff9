import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, FileCode, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  parseEsocialXml,
  guessCategoryFromDescription,
  type RubricCategory,
} from "@/lib/esocialParser";

interface Rubric {
  id: string;
  cod_rubr: string;
  ide_tab_rubr: string | null;
  description: string;
  nat_rubr: string | null;
  tp_rubr: string | null;
  category: RubricCategory;
  is_active: boolean;
}

const CATEGORY_LABELS: Record<RubricCategory, string> = {
  salary: "Salário",
  advance: "Adiantamento",
  food_voucher: "Vale Alimentação",
  transport_voucher: "Vale Transporte",
  health_plan: "Plano de Saúde",
  inss: "INSS",
  irrf: "IRRF",
  infraction: "Infração / desconto disciplinar",
  bonus: "Bônus / bonificação",
  other_earning: "Outros proventos",
  other_discount: "Outros descontos",
  informative: "Informativa (não soma)",
};

export default function PayrollRubricsPanel() {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("payroll_rubrics")
      .select("*")
      .order("cod_rubr");
    if (error) {
      toast({ title: "Erro ao carregar rubricas", description: error.message, variant: "destructive" });
    } else {
      setRubrics((data ?? []) as Rubric[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const xml = await file.text();
      const parsed = parseEsocialXml(xml);
      if (parsed.type !== "S-1010") {
        throw new Error(
          parsed.type === "S-1200"
            ? "Este arquivo é um S-1200 (remuneração). Envie-o na aba Folha de Pagamento."
            : "Arquivo XML não é um evento S-1010 (Tabela de Rubricas) do eSocial."
        );
      }
      if (parsed.rubrics_table.length === 0) {
        throw new Error("Nenhuma rubrica encontrada no XML.");
      }

      const payload = parsed.rubrics_table.map((r) => ({
        cod_rubr: r.cod_rubr,
        ide_tab_rubr: r.ide_tab_rubr,
        description: r.description,
        nat_rubr: r.nat_rubr,
        tp_rubr: r.tp_rubr,
        category: guessCategoryFromDescription(r.description),
        is_active: true,
      }));

      const { error } = await (supabase as any)
        .from("payroll_rubrics")
        .upsert(payload, { onConflict: "cod_rubr,ide_tab_rubr", ignoreDuplicates: false });
      if (error) throw error;

      toast({
        title: "Tabela de rubricas importada",
        description: `${payload.length} rubricas processadas. Revise e ajuste as categorias quando necessário.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Falha ao importar S-1010", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateCategory = async (id: string, category: RubricCategory) => {
    const { error } = await (supabase as any)
      .from("payroll_rubrics")
      .update({ category })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setRubrics((prev) => prev.map((r) => (r.id === id ? { ...r, category } : r)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta rubrica do cadastro?")) return;
    const { error } = await (supabase as any).from("payroll_rubrics").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setRubrics((prev) => prev.filter((r) => r.id !== id));
  };

  const filtered = rubrics.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.cod_rubr.toLowerCase().includes(s) ||
      r.description.toLowerCase().includes(s) ||
      (r.nat_rubr ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm flex items-start gap-2">
        <FileCode className="h-4 w-4 mt-0.5 text-primary" />
        <div className="space-y-1">
          <div>
            <span className="font-medium">Tabela de Rubricas (eSocial S-1010)</span> — envie aqui
            o XML que cadastra as rubricas do empregador. Cada rubrica precisa estar
            categorizada para que a importação da folha (S-1200) some os valores corretamente.
          </div>
          <div className="text-xs text-muted-foreground">
            A categoria inicial é sugerida pelo nome (ex.: "INSS MENSAL" → INSS). Revise antes
            de importar a folha.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-2 flex-1 min-w-[260px]">
          <Label>Buscar rubrica</Label>
          <Input
            placeholder="Código, descrição ou natureza"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importar XML S-1010
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-md">
          {rubrics.length === 0
            ? "Nenhuma rubrica cadastrada. Importe o XML S-1010 para começar."
            : "Nenhuma rubrica encontrada para a busca."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[120px]">Natureza</TableHead>
                <TableHead className="w-[90px] text-center">Tipo</TableHead>
                <TableHead className="w-[260px]">Categoria do sistema</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.cod_rubr}</TableCell>
                  <TableCell className="text-sm">{r.description}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.nat_rubr ?? "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {r.tp_rubr === "1"
                      ? "Provento"
                      : r.tp_rubr === "2"
                        ? "Desconto"
                        : r.tp_rubr === "3" || r.tp_rubr === "4"
                          ? "Inform."
                          : "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.category}
                      onValueChange={(v) => updateCategory(r.id, v as RubricCategory)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORY_LABELS) as RubricCategory[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {CATEGORY_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(r.id)}
                      aria-label="Remover rubrica"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
