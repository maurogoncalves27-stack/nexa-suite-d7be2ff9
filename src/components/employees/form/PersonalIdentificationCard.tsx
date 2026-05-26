import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";
import { ETHNICITY_OPTIONS, MARITAL_REQUIRES_SPOUSE, MARITAL_STATUS_OPTIONS } from "@/lib/employeeOptions";
import { Field, type EmployeeState, type SetEmployee } from "./shared";

export default function PersonalIdentificationCard({
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
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Identificação pessoal</CardTitle>
          <CardDescription>Dados básicos, documentos pessoais e contato</CardDescription>
        </CardHeader>
      )}
      <CardContent>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome completo*">
            <Input value={employee.full_name} onChange={(e) => setEmployee({ ...employee, full_name: e.target.value })} required />
          </Field>
          <Field label="Nome social">
            <Input
              value={employee.social_name ?? ""}
              onChange={(e) => setEmployee({ ...employee, social_name: e.target.value })}
              placeholder="Como gosta de ser chamado(a)"
            />
          </Field>
          <Field label="CPF">
            <Input value={employee.cpf} onChange={(e) => setEmployee({ ...employee, cpf: e.target.value })} />
          </Field>
          <Field label="RG">
            <Input value={employee.rg} onChange={(e) => setEmployee({ ...employee, rg: e.target.value })} />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={employee.birth_date} onChange={(e) => setEmployee({ ...employee, birth_date: e.target.value })} />
          </Field>
          <Field label="Sexo biológico">
            <Select value={employee.gender || ""} onValueChange={(v) => setEmployee({ ...employee, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Masculino</SelectItem>
                <SelectItem value="female">Feminino</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Identidade de gênero">
            <Select
              value={employee.gender_identity || ""}
              onValueChange={(v) => setEmployee({ ...employee, gender_identity: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cis_man">Homem cisgênero</SelectItem>
                <SelectItem value="cis_woman">Mulher cisgênero</SelectItem>
                <SelectItem value="trans_man">Homem trans</SelectItem>
                <SelectItem value="trans_woman">Mulher trans</SelectItem>
                <SelectItem value="non_binary">Não-binário</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
                <SelectItem value="prefer_not">Prefiro não informar</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="E-mail">
            <Input type="email" value={employee.email} onChange={(e) => setEmployee({ ...employee, email: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={employee.phone} onChange={(e) => setEmployee({ ...employee, phone: e.target.value })} />
          </Field>
          <Field label="Nacionalidade">
            <Input value={employee.nationality ?? ""} onChange={(e) => setEmployee({ ...employee, nationality: e.target.value })} />
          </Field>
          <Field label="Naturalidade">
            <Input
              value={employee.birth_state ?? ""}
              onChange={(e) => setEmployee({ ...employee, birth_state: e.target.value })}
              placeholder="Cidade / Estado de nascimento"
            />
          </Field>
          <Field label="Etnia / Raça">
            <Select
              value={employee.ethnicity || ""}
              onValueChange={(v) => setEmployee({ ...employee, ethnicity: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ETHNICITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estado civil">
            <Select
              value={employee.marital_status || ""}
              onValueChange={(v) => setEmployee({ ...employee, marital_status: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {MARITAL_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {MARITAL_REQUIRES_SPOUSE.includes(employee.marital_status ?? "") && (
            <Field label="Nome do(a) cônjuge">
              <Input value={employee.spouse_name ?? ""} onChange={(e) => setEmployee({ ...employee, spouse_name: e.target.value })} />
            </Field>
          )}
          <Field label="Nome do pai">
            <Input value={employee.father_name ?? ""} onChange={(e) => setEmployee({ ...employee, father_name: e.target.value })} />
          </Field>
          <Field label="Nome da mãe">
            <Input value={employee.mother_name ?? ""} onChange={(e) => setEmployee({ ...employee, mother_name: e.target.value })} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
