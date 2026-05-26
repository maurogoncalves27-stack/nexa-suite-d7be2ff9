import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GraduationCap, FileText, IdCard, Car, Plane } from "lucide-react";
import {
  EDUCATION_OPTIONS,
  BRAZILIAN_STATES,
  CNH_CATEGORY_OPTIONS,
  DISABILITY_OPTIONS,
} from "@/lib/employeeOptions";
import { Field, type EmployeeState, type SetEmployee } from "./shared";

export default function DocumentsAndEducationCard({
  employee,
  setEmployee,
  hideHeader,
}: {
  employee: EmployeeState;
  setEmployee: SetEmployee;
  hideHeader?: boolean;
}) {
  const isForeigner = (employee.nationality || "").toString().trim().toLowerCase() !== "" &&
    !["brasileira", "brasileiro", "brasil"].includes((employee.nationality || "").toString().trim().toLowerCase());

  return (
    <Card>
      {!hideHeader && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /> Documentação e formação</CardTitle>
          <CardDescription>Documentos civis, eleitorais, escolaridade, CTPS, CNH e PCD</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        {/* Formação e PIS/eleitor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Grau de instrução">
            <Select
              value={employee.education_level || ""}
              onValueChange={(v) => setEmployee({ ...employee, education_level: v })}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {EDUCATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Número do NIS / PIS">
            <Input value={employee.nis_number ?? ""} onChange={(e) => setEmployee({ ...employee, nis_number: e.target.value })} />
          </Field>
          <Field label="Título de eleitor">
            <Input value={employee.voter_id ?? ""} onChange={(e) => setEmployee({ ...employee, voter_id: e.target.value })} />
          </Field>
          <Field label="Zona eleitoral">
            <Input value={employee.voter_zone ?? ""} onChange={(e) => setEmployee({ ...employee, voter_zone: e.target.value })} />
          </Field>
          <Field label="Seção eleitoral">
            <Input value={employee.voter_section ?? ""} onChange={(e) => setEmployee({ ...employee, voter_section: e.target.value })} />
          </Field>
          {employee.gender === "male" && (
            <Field label="Certificado de reservista (nº)">
              <Input value={employee.reservist_number ?? ""} onChange={(e) => setEmployee({ ...employee, reservist_number: e.target.value })} />
            </Field>
          )}
        </div>

        {/* CTPS */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Carteira de Trabalho (CTPS)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Número da CTPS">
              <Input
                value={employee.ctps_number ?? ""}
                onChange={(e) => setEmployee({ ...employee, ctps_number: e.target.value })}
              />
            </Field>
            <Field label="Série">
              <Input
                value={employee.ctps_series ?? ""}
                onChange={(e) => setEmployee({ ...employee, ctps_series: e.target.value })}
              />
            </Field>
            <Field label="UF emissora">
              <Select
                value={employee.ctps_uf || ""}
                onValueChange={(v) => setEmployee({ ...employee, ctps_uf: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map((s) => (
                    <SelectItem key={s.uf} value={s.uf}>{s.uf} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de emissão">
              <Input
                type="date"
                value={employee.ctps_issue_date ?? ""}
                onChange={(e) => setEmployee({ ...employee, ctps_issue_date: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* RG complementar */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <IdCard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">RG — dados complementares</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Órgão emissor (ex.: SSP)">
              <Input
                value={employee.rg_issuer ?? ""}
                onChange={(e) => setEmployee({ ...employee, rg_issuer: e.target.value })}
              />
            </Field>
            <Field label="UF emissora do RG">
              <Select
                value={employee.rg_uf || ""}
                onValueChange={(v) => setEmployee({ ...employee, rg_uf: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map((s) => (
                    <SelectItem key={s.uf} value={s.uf}>{s.uf} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de emissão do RG">
              <Input
                type="date"
                value={employee.rg_issue_date ?? ""}
                onChange={(e) => setEmployee({ ...employee, rg_issue_date: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* CNH */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">CNH (opcional)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Número da CNH">
              <Input
                value={employee.cnh_number ?? ""}
                onChange={(e) => setEmployee({ ...employee, cnh_number: e.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <Select
                value={employee.cnh_category || ""}
                onValueChange={(v) => setEmployee({ ...employee, cnh_category: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CNH_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Validade">
              <Input
                type="date"
                value={employee.cnh_expiration ?? ""}
                onChange={(e) => setEmployee({ ...employee, cnh_expiration: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* PCD */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <h3 className="font-semibold text-sm">Pessoa com Deficiência (PCD)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de deficiência">
              <Select
                value={employee.disability_type || "none"}
                onValueChange={(v) => setEmployee({ ...employee, disability_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISABILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        {/* Estrangeiros */}
        {isForeigner && (
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Trabalhador estrangeiro</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nº do passaporte">
                <Input
                  value={employee.passport_number ?? ""}
                  onChange={(e) => setEmployee({ ...employee, passport_number: e.target.value })}
                />
              </Field>
              <Field label="RNM / RNE">
                <Input
                  value={employee.foreigner_rnm ?? ""}
                  onChange={(e) => setEmployee({ ...employee, foreigner_rnm: e.target.value })}
                />
              </Field>
              <Field label="Tipo de visto">
                <Input
                  value={employee.foreigner_visa_type ?? ""}
                  onChange={(e) => setEmployee({ ...employee, foreigner_visa_type: e.target.value })}
                  placeholder="Ex.: permanente, temporário"
                />
              </Field>
              <Field label="Data de chegada ao Brasil">
                <Input
                  type="date"
                  value={employee.foreigner_arrival_date ?? ""}
                  onChange={(e) => setEmployee({ ...employee, foreigner_arrival_date: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
