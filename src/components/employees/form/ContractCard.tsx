import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Briefcase, ShieldAlert } from "lucide-react";
import PositionSelect from "@/components/employees/PositionSelect";
import { Field, WorkScheduleField, type EmployeeState, type SetEmployee } from "./shared";
import {
  ESOCIAL_CATEGORY_OPTIONS,
  WORK_REGIME_OPTIONS,
  JOURNEY_TYPE_OPTIONS,
  SALARY_TYPE_OPTIONS,
  HAZARD_PAY_OPTIONS,
} from "@/lib/employeeOptions";

interface Store {
  id: string;
  name: string;
  cnpj: string | null;
  legal_name: string | null;
  parent_store_id: string | null;
}

export default function ContractCard({
  employee,
  setEmployee,
  stores,
  hideHeader,
}: {
  employee: EmployeeState;
  setEmployee: SetEmployee;
  stores: Store[];
  /** @deprecated mantido por compatibilidade; cargos novos são criados em Configurações → Cargos */
  onOpenNewPosition?: () => void;
  hideHeader?: boolean;
}) {
  const [pendingTermination, setPendingTermination] = useState(false);
  const [termDate, setTermDate] = useState<string>("");
  return (
    <Card>
      {!hideHeader && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> Vínculo e contrato</CardTitle>
          <CardDescription>Loja, cargo, contrato e status atual</CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Loja contratante (matriz)*">
            <Select
              value={employee.store_id}
              onValueChange={(v) =>
                setEmployee({ ...employee, store_id: v, allocated_store_id: v })
              }
            >
              <SelectTrigger><SelectValue placeholder="Selecione a matriz" /></SelectTrigger>
              <SelectContent>
                {stores
                  .filter((s) => !s.parent_store_id)
                  .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Alocação atual (matriz ou filial)">
            <Select
              value={employee.allocated_store_id || employee.store_id}
              onValueChange={(v) => setEmployee({ ...employee, allocated_store_id: v })}
              disabled={!employee.store_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={employee.store_id ? "Selecione" : "Selecione a matriz primeiro"} />
              </SelectTrigger>
              <SelectContent>
                {stores
                  .filter((s) => s.id === employee.store_id || s.parent_store_id === employee.store_id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.id === employee.store_id ? `${s.name} (matriz)` : s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo de contrato">
            <Select value={employee.contract_type} onValueChange={(v) => setEmployee({ ...employee, contract_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLT">CLT</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem>
                <SelectItem value="Estágio">Estágio</SelectItem>
                <SelectItem value="Trainee">Trainee</SelectItem>
                <SelectItem value="Temporário">Temporário</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cargo (CBO)">
            <PositionSelect
              value={{
                positionId: employee.position_id || null,
                name: employee.position || "",
                cboCode: employee.cbo_code || null,
                cboTitle: employee.cbo_title || null,
              }}
              onChange={(v) =>
                setEmployee({
                  ...employee,
                  position_id: v.positionId,
                  position: v.name,
                  cbo_code: v.cboCode ?? "",
                  cbo_title: v.cboTitle ?? "",
                })
              }
            />
            {employee.position && !employee.cbo_code && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Cargo isento de CBO (estágio / trainee / freelancer).
              </p>
            )}
          </Field>
          <Field label="Departamento">
            <Input value={employee.department} onChange={(e) => setEmployee({ ...employee, department: e.target.value })} />
          </Field>
          <Field label="Data de contratação (entrada no sistema)">
            <Input type="date" value={employee.hire_date} onChange={(e) => setEmployee({ ...employee, hire_date: e.target.value })} />
          </Field>
          <Field label="Salário">
            <Input type="number" step="0.01" value={employee.salary} onChange={(e) => setEmployee({ ...employee, salary: e.target.value })} />
          </Field>
          <Field label="Co-part. plano de saúde (R$/mês)">
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="0,00"
              value={employee.health_plan_copay ?? ""}
              onChange={(e) => setEmployee({ ...employee, health_plan_copay: e.target.value })}
            />
          </Field>
          <Field label="Prazo do contrato de experiência (dias)">
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="Ex.: 45 ou 90"
              value={employee.experience_contract_days ?? ""}
              onChange={(e) => setEmployee({ ...employee, experience_contract_days: e.target.value })}
            />
          </Field>
          <Field label="Escala">
            <WorkScheduleField
              value={employee.work_schedule ?? ""}
              onChange={(v) => setEmployee({ ...employee, work_schedule: v })}
            />
          </Field>
          <Field label="Dispensado de bater ponto">
            <div className="flex items-center gap-3 h-10 rounded-md border bg-background px-3">
              <input
                type="checkbox"
                id="exempt_from_timeclock"
                className="h-4 w-4 accent-primary"
                checked={!!employee.exempt_from_timeclock}
                onChange={(e) => setEmployee({ ...employee, exempt_from_timeclock: e.target.checked })}
              />
              <label htmlFor="exempt_from_timeclock" className="text-sm cursor-pointer select-none">
                Sim — não exibir registro de ponto na área deste colaborador
              </label>
            </div>
          </Field>
          <Field label="Status">
            <Select
              value={employee.status}
              onValueChange={(v) => {
                if (v === "terminated" && employee.status !== "terminated") {
                  setPendingTermination(true);
                  setTermDate(new Date().toISOString().slice(0, 10));
                  return;
                }
                setEmployee({ ...employee, status: v });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in_training">Em treinamento</SelectItem>
                <SelectItem value="pending_approval">Aguardando admissão</SelectItem>
                <SelectItem value="active">Ativo (admitido)</SelectItem>
                <SelectItem value="on_leave">Afastado</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="rejected">Reprovado no treinamento</SelectItem>
                <SelectItem value="terminated">Desligado</SelectItem>
              </SelectContent>
            </Select>
            {employee.status === "terminated" && employee.termination_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Desligado em {new Date(employee.termination_date + "T00:00:00").toLocaleDateString("pt-BR")}{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => { setPendingTermination(true); setTermDate(employee.termination_date); }}
                >
                  alterar
                </button>
              </p>
            )}
          </Field>
        </div>

        <Dialog open={pendingTermination} onOpenChange={setPendingTermination}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Data de desligamento</DialogTitle>
              <DialogDescription>
                Informe a data efetiva. Para estagiários, ela é usada para calcular automaticamente a rescisão (1/12 de recesso por mês completo + saldo proporcional da bolsa).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="term-date">Data</Label>
              <Input
                id="term-date"
                type="date"
                value={termDate}
                onChange={(e) => setTermDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPendingTermination(false)}>Cancelar</Button>
              <Button
                disabled={!termDate}
                onClick={() => {
                  setEmployee({ ...employee, status: "terminated", termination_date: termDate });
                  setPendingTermination(false);
                }}
              >
                Confirmar desligamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Treinamento e admissão</h3>
            <p className="text-xs text-muted-foreground">
              Todo novo colaborador passa por <strong>7 dias de treinamento</strong>. A admissão oficial só ocorre após aprovação no treinamento e documentação completa.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Situação do treinamento">
              <Select
                value={employee.training_status || "pending"}
                onValueChange={(v) => setEmployee({ ...employee, training_status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="rejected">Reprovado</SelectItem>
                  <SelectItem value="not_required">Não se aplica</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de início do treinamento">
              <Input
                type="date"
                value={employee.training_start_date ?? ""}
                onChange={(e) => setEmployee({ ...employee, training_start_date: e.target.value })}
              />
            </Field>
            <Field label="Data de fim do treinamento">
              <Input
                type="date"
                value={employee.training_end_date ?? ""}
                onChange={(e) => setEmployee({ ...employee, training_end_date: e.target.value })}
              />
            </Field>
            <Field label="Data de admissão (oficial)">
              <Input
                type="date"
                value={employee.admission_date ?? ""}
                onChange={(e) => setEmployee({ ...employee, admission_date: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* eSocial / CLT */}
        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Dados eSocial / CLT</h3>
            <p className="text-xs text-muted-foreground">
              Informações usadas em folha, eSocial (S-2200, S-1200) e cálculos trabalhistas. Preencher o quanto antes — pode ficar em branco até a admissão oficial.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoria eSocial">
              <Select
                value={employee.esocial_category || ""}
                onValueChange={(v) => setEmployee({ ...employee, esocial_category: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione (ex.: 101)" /></SelectTrigger>
                <SelectContent>
                  {ESOCIAL_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Regime de trabalho">
              <Select
                value={employee.work_regime || "clt"}
                onValueChange={(v) => setEmployee({ ...employee, work_regime: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_REGIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de jornada (eSocial)">
              <Select
                value={employee.journey_type || ""}
                onValueChange={(v) => setEmployee({ ...employee, journey_type: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {JOURNEY_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de salário">
              <Select
                value={employee.salary_type || "mensal"}
                onValueChange={(v) => setEmployee({ ...employee, salary_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALARY_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Horas semanais contratadas">
              <Input
                type="number"
                step="0.5"
                min={0}
                placeholder="Ex.: 44"
                value={employee.weekly_hours ?? ""}
                onChange={(e) => setEmployee({ ...employee, weekly_hours: e.target.value })}
              />
            </Field>
            <Field label="Horas mensais contratadas">
              <Input
                type="number"
                step="0.5"
                min={0}
                placeholder="Ex.: 220"
                value={employee.monthly_hours ?? ""}
                onChange={(e) => setEmployee({ ...employee, monthly_hours: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* Periculosidade / insalubridade */}
        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Periculosidade / insalubridade</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Adicional">
              <Select
                value={employee.hazard_pay_type || "none"}
                onValueChange={(v) => {
                  const map: Record<string, string> = {
                    insalubridade_10: "10",
                    insalubridade_20: "20",
                    insalubridade_40: "40",
                    periculosidade_30: "30",
                    none: "",
                  };
                  setEmployee({ ...employee, hazard_pay_type: v, hazard_pay_percent: map[v] ?? "" });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HAZARD_PAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Percentual aplicado (%)">
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={employee.hazard_pay_percent ?? ""}
                onChange={(e) => setEmployee({ ...employee, hazard_pay_percent: e.target.value })}
                disabled={!employee.hazard_pay_type || employee.hazard_pay_type === "none"}
              />
            </Field>
          </div>
        </div>

        {/* Marcadores trabalhistas */}
        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3">
          <h3 className="font-semibold text-sm">Marcadores trabalhistas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 h-10 rounded-md border bg-background px-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={!!employee.first_job}
                onChange={(e) => setEmployee({ ...employee, first_job: e.target.checked })}
              />
              <span className="text-sm select-none">Primeiro emprego</span>
            </label>
            <label className="flex items-center gap-3 h-10 rounded-md border bg-background px-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={!!employee.union_member}
                onChange={(e) => setEmployee({ ...employee, union_member: e.target.checked })}
              />
              <span className="text-sm select-none">Sindicalizado</span>
            </label>
            <label className="flex items-center gap-3 h-10 rounded-md border bg-background px-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={!!employee.is_apprentice}
                onChange={(e) => setEmployee({ ...employee, is_apprentice: e.target.checked })}
              />
              <span className="text-sm select-none">Aprendiz / menor</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
