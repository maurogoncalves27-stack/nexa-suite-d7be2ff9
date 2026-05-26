import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/** Field wrapper usado em todos os cards do formulário. */
export const Field = ({
  label,
  children,
  className = "",
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) => (
  <div className={`space-y-2 ${className}`}>
    <Label>
      {label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
  </div>
);

/** Tipo do estado central — espelha o objeto `employee` da página. */
export type EmployeeState = any;
export type SetEmployee = (updater: EmployeeState | ((prev: EmployeeState) => EmployeeState)) => void;

/* ---------- CEP ---------- */

const formatCep = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export const CepField = ({
  value,
  onChange,
  onResolved,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved: (addr: { address?: string; city?: string; state?: string }) => void;
}) => {
  const [loading, setLoading] = useState(false);

  const lookup = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        const street = [data.logradouro, data.bairro].filter(Boolean).join(", ");
        onResolved({ address: street, city: data.localidade, state: data.uf });
        toast({ title: "Endereço preenchido pelo CEP" });
      } else {
        toast({ title: "CEP não encontrado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar CEP", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <Input
        placeholder="00000-000"
        value={value}
        onChange={(e) => {
          const f = formatCep(e.target.value);
          onChange(f);
          if (f.replace(/\D/g, "").length === 8) lookup(f);
        }}
        onBlur={(e) => lookup(e.target.value)}
        maxLength={9}
      />
      {loading && (
        <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
    </div>
  );
};

/* ---------- Escala ---------- */

const PRESET_SCHEDULES = ["5x2", "12x36", "6x1", "Home Office", "Híbrido (Home Office + Presencial)"];

export const WorkScheduleField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => {
  const isPreset = PRESET_SCHEDULES.includes(value);
  const mode = !value ? "" : isPreset ? value : "outro";

  return (
    <div className="space-y-2">
      <Select
        value={mode}
        onValueChange={(v) => {
          if (v === "outro") onChange("");
          else onChange(v);
        }}
      >
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {PRESET_SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          <SelectItem value="outro">Outro (especificar)</SelectItem>
        </SelectContent>
      </Select>
      {mode === "outro" && (
        <Input
          placeholder="Descreva a escala"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};
