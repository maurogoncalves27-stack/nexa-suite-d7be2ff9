import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Landmark } from "lucide-react";
import { Field, type EmployeeState, type SetEmployee } from "./shared";

export default function BankCard({
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
          <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /> Dados bancários e PIX</CardTitle>
          <CardDescription>Informações usadas para pagamentos e folha</CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tipo da chave PIX">
            <Select
              value={employee.pix_key_type || ""}
              onValueChange={(v) => setEmployee({ ...employee, pix_key_type: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="random">Chave aleatória</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Chave PIX">
            <Input
              value={employee.pix_key ?? ""}
              onChange={(e) => setEmployee({ ...employee, pix_key: e.target.value })}
              placeholder="Informe a chave PIX"
            />
          </Field>
          <Field label="Banco" required>
            <Input
              value={employee.bank_name ?? ""}
              onChange={(e) => setEmployee({ ...employee, bank_name: e.target.value })}
              placeholder="Ex.: Itaú, Nubank, Caixa"
              required
            />
          </Field>
          <Field label="Tipo de conta">
            <Select
              value={employee.bank_account_type || ""}
              onValueChange={(v) => setEmployee({ ...employee, bank_account_type: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Conta corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
                <SelectItem value="salario">Conta salário</SelectItem>
                <SelectItem value="pagamento">Conta de pagamento</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Agência">
            <Input
              value={employee.bank_agency ?? ""}
              onChange={(e) => setEmployee({ ...employee, bank_agency: e.target.value })}
              placeholder="Ex.: 0001"
            />
          </Field>
          <Field label="Conta (com dígito)">
            <Input
              value={employee.bank_account ?? ""}
              onChange={(e) => setEmployee({ ...employee, bank_account: e.target.value })}
              placeholder="Ex.: 12345-6"
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
