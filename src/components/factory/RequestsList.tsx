import { Check, Loader2, PackageCheck, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fmtDate, fmtNum, STATUS_LABEL, STATUS_VARIANT,
  type FactoryRequest,
} from "@/lib/factoryRequests";

export interface RequestsListProps {
  loading: boolean;
  requests: FactoryRequest[];
  mode: "mine" | "fulfill" | "history";
  currentUserId: string | null;
  emptyMessage: string;
  onApprove?: (id: string) => void;
  onShip?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  onConfirmReceipt?: (id: string) => void;
  onItemQtyChange?: (
    itemId: string,
    field: "quantity_approved" | "quantity_delivered",
    value: number | null,
  ) => void;
  busyId?: string | null;
}

export default function RequestsList({
  loading,
  requests,
  mode,
  currentUserId,
  emptyMessage,
  onApprove,
  onShip,
  onReject,
  onCancel,
  onConfirmReceipt,
  onItemQtyChange,
  busyId,
}: RequestsListProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const showApprove = mode === "fulfill" && r.status === "pending";
        const showShip = mode === "fulfill" && r.status === "approved";
        const showReject = mode === "fulfill" && (r.status === "pending" || r.status === "approved");
        const showCancel = mode === "mine" && r.status === "pending" && currentUserId != null;
        const showConfirm = mode === "mine" && r.status === "shipped";
        const editable = mode === "fulfill" && (r.status === "pending" || r.status === "approved");

        return (
          <Card key={r.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <span className="truncate">{r.store?.name ?? "—"}</span>
                    <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Solicitado em {fmtDate(r.requested_at)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {r.notes && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-2">
                  {r.notes}
                </p>
              )}

              {r.rejection_reason && (
                <div className="text-xs bg-destructive/10 text-destructive rounded p-2">
                  <b>Motivo da recusa:</b> {r.rejection_reason}
                </div>
              )}

              <div className="border rounded-md divide-y">
                {r.items.map((it) => (
                  <div key={it.id} className="p-2 sm:p-3 text-sm">
                    <div className="flex justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {it.inventory_products?.name ?? "—"}
                        </p>
                        {it.notes && (
                          <p className="text-xs text-muted-foreground">{it.notes}</p>
                        )}
                      </div>
                      <div className="text-xs text-right">
                        <p className="text-muted-foreground">Solicitado</p>
                        <p className="font-medium tabular-nums">
                          {fmtNum(it.quantity_requested)} {it.unit}
                        </p>
                      </div>
                    </div>

                    {(editable || it.quantity_approved != null || it.quantity_delivered != null) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Aprovado
                          </Label>
                          {editable ? (
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="h-8 text-sm"
                              defaultValue={it.quantity_approved ?? it.quantity_requested}
                              onBlur={(e) => {
                                const v = e.target.value === "" ? null : Number(e.target.value);
                                if (v !== it.quantity_approved) {
                                  onItemQtyChange?.(it.id, "quantity_approved", v);
                                }
                              }}
                            />
                          ) : (
                            <p className="text-sm tabular-nums">
                              {fmtNum(it.quantity_approved)} {it.unit}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Entregue
                          </Label>
                          {editable && r.status === "approved" ? (
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="h-8 text-sm"
                              defaultValue={
                                it.quantity_delivered ?? it.quantity_approved ?? it.quantity_requested
                              }
                              onBlur={(e) => {
                                const v = e.target.value === "" ? null : Number(e.target.value);
                                if (v !== it.quantity_delivered) {
                                  onItemQtyChange?.(it.id, "quantity_delivered", v);
                                }
                              }}
                            />
                          ) : (
                            <p className="text-sm tabular-nums">
                              {fmtNum(it.quantity_delivered)} {it.unit}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(showApprove || showShip || showReject || showCancel || showConfirm) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {showApprove && (
                    <Button
                      size="sm"
                      onClick={() => onApprove?.(r.id)}
                      disabled={busyId === r.id}
                      className="gap-1"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Aprovar
                    </Button>
                  )}
                  {showShip && (
                    <Button
                      size="sm"
                      onClick={() => onShip?.(r.id)}
                      disabled={busyId === r.id}
                      className="gap-1"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Marcar enviado
                    </Button>
                  )}
                  {showReject && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReject?.(r.id)}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" /> Recusar
                    </Button>
                  )}
                  {showCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCancel?.(r.id)}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  )}
                  {showConfirm && (
                    <Button
                      size="sm"
                      onClick={() => onConfirmReceipt?.(r.id)}
                      className="gap-1"
                    >
                      <PackageCheck className="h-3.5 w-3.5" /> Confirmar recebimento
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t">
                {r.approved_at && <span>Aprovado: {fmtDate(r.approved_at)}</span>}
                {r.shipped_at && <span>Enviado: {fmtDate(r.shipped_at)}</span>}
                {r.received_at && <span>Recebido: {fmtDate(r.received_at)}</span>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
