import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CellMode = "work" | "off" | "home_office" | "none";

export interface CellForm {
  employeeId: string;
  employeeName: string;
  date: Date;
  mode: CellMode;
  start_time: string;
  end_time: string;
  break_start: string;
  break_end: string;
  has_second_break: boolean;
  break_start_2: string;
  break_end_2: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: CellForm | null;
  setForm: (f: CellForm) => void;
  onSave: () => void;
}

export default function CellEditDialog({ open, onOpenChange, form, setForm, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form && `${form.employeeName} — ${format(form.date, "dd/MM/yyyy", { locale: ptBR })}`}
          </DialogTitle>
        </DialogHeader>
        {form && (
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.mode} onValueChange={(v: CellMode) => setForm({ ...form, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem atribuição</SelectItem>
                  <SelectItem value="work">Trabalho (presencial)</SelectItem>
                  <SelectItem value="home_office">Home Office</SelectItem>
                  <SelectItem value="off">Folga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.mode === "work" || form.mode === "home_office") && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Início</Label>
                    <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Início intervalo 1</Label>
                    <Input type="time" value={form.break_start} onChange={(e) => setForm({ ...form, break_start: e.target.value })} />
                  </div>
                  <div>
                    <Label>Fim intervalo 1</Label>
                    <Input type="time" value={form.break_end} onChange={(e) => setForm({ ...form, break_end: e.target.value })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.has_second_break}
                    onChange={(e) => setForm({ ...form, has_second_break: e.target.checked })}
                  />
                  Dividir em 2 intervalos
                </label>
                {form.has_second_break && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Início intervalo 2</Label>
                      <Input type="time" value={form.break_start_2} onChange={(e) => setForm({ ...form, break_start_2: e.target.value })} />
                    </div>
                    <div>
                      <Label>Fim intervalo 2</Label>
                      <Input type="time" value={form.break_end_2} onChange={(e) => setForm({ ...form, break_end_2: e.target.value })} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter><Button onClick={onSave}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
