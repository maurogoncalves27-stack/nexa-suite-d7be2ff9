import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitBranch, Store, ArrowDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TrailRow {
  id: string;
  store_id: string;
  store_name: string;
  product_name: string;
  lot_number: string | null;
  quantity: number;
  initial_quantity: number;
  expiry_date: string;
  status: string;
  parent_lot_id: string | null;
  origin_transfer_id: string | null;
  created_at: string;
  depth: number;
}

interface Props {
  lotId: string | null;
  onClose: () => void;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "active": return { cls: "bg-primary/15 text-primary border-primary/30", label: "Ativo" };
    case "depleted": return { cls: "bg-muted text-muted-foreground border-border", label: "Esgotado" };
    case "expired": return { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Vencido" };
    case "discarded": return { cls: "bg-secondary text-secondary-foreground border-border", label: "Descartado" };
    default: return { cls: "bg-muted text-muted-foreground", label: status };
  }
};

export default function LotTrailDialog({ lotId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<TrailRow[]>([]);

  useEffect(() => {
    if (!lotId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("lot_trail" as any, { _lot_id: lotId });
      setLoading(false);
      if (error) {
        console.error(error);
        setTrail([]);
        return;
      }
      setTrail((data as TrailRow[]) ?? []);
    })();
  }, [lotId]);

  return (
    <Dialog open={!!lotId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Trilha do lote
          </DialogTitle>
          <DialogDescription>
            Caminho completo do lote desde a origem até as transferências para outras lojas.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && trail.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma informação encontrada.</p>
        )}

        {!loading && trail.length > 0 && (
          <div className="space-y-2">
            {trail.map((row, idx) => {
              const badge = statusBadge(row.status);
              const isCurrent = row.id === lotId;
              return (
                <div key={row.id}>
                  {idx > 0 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg border p-3 ${
                      isCurrent ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "bg-muted/20"
                    }`}
                    style={{ marginLeft: `${row.depth * 16}px` }}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Store className="h-3.5 w-3.5 text-muted-foreground" />
                          {row.store_name}
                          {isCurrent && (
                            <Badge variant="outline" className="text-[10px] h-5">você está aqui</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.product_name} • Lote{" "}
                          <span className="font-mono">{row.lot_number || "S/N"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Criado em {format(parseISO(row.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          {" • "}Validade {format(parseISO(row.expiry_date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
                        <div className="text-xs">
                          <span className="font-medium">{Number(row.quantity).toLocaleString("pt-BR")}</span>
                          <span className="text-muted-foreground"> / {Number(row.initial_quantity).toLocaleString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
