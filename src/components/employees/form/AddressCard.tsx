import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MapPin } from "lucide-react";
import { BRAZILIAN_STATES } from "@/lib/employeeOptions";
import { CepField, Field, type EmployeeState, type SetEmployee } from "./shared";

export default function AddressCard({
  employee,
  setEmployee,
  hideHeader,
}: {
  employee: EmployeeState;
  setEmployee: SetEmployee;
  hideHeader?: boolean;
}) {
  return (
    <Card>
      {!hideHeader && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Endereço</CardTitle>
          <CardDescription>Informe o CEP para preenchimento automático</CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="CEP">
            <CepField
              value={employee.zip_code ?? ""}
              onChange={(v) => setEmployee({ ...employee, zip_code: v })}
              onResolved={(addr) =>
                setEmployee((prev: any) => ({
                  ...prev,
                  address: addr.address || prev.address,
                  city: addr.city || prev.city,
                  state: addr.state || prev.state,
                }))
              }
            />
          </Field>
          <Field label="Cidade">
            <Input value={employee.city ?? ""} onChange={(e) => setEmployee({ ...employee, city: e.target.value })} />
          </Field>
          <Field label="Estado (UF)">
            <Select value={employee.state || ""} onValueChange={(v) => setEmployee({ ...employee, state: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {BRAZILIAN_STATES.map((s) => (
                  <SelectItem key={s.uf} value={s.uf}>{s.uf} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Endereço (rua, número, complemento, bairro)" className="md:col-span-2">
            <Input value={employee.address} onChange={(e) => setEmployee({ ...employee, address: e.target.value })} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
