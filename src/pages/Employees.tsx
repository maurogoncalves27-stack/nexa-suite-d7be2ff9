import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Building2, UserCog, UserCheck, Briefcase } from "lucide-react";
import EmployeesList from "@/components/employees/EmployeesList";
import OutsourcedCompaniesPanel from "@/components/outsourced/OutsourcedCompaniesPanel";
import OutsourcedProfessionalsPanel from "@/components/outsourced/OutsourcedProfessionalsPanel";
import FreelancersPanel from "@/components/freelancers/FreelancersPanel";
import PositionResponsibilitiesPanel from "@/components/announcements/PositionResponsibilitiesPanel";

export default function Employees() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Cadastros
        </h1>
        <p className="text-muted-foreground">Cadastro e gestão de pessoas (CLT, terceirizados e freelancers)</p>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:flex h-auto w-full sm:w-auto gap-1">
          <TabsTrigger value="employees" className="gap-1"><Users className="h-4 w-4" /> Colaboradores</TabsTrigger>
          <TabsTrigger value="outsourced-companies" className="gap-1"><Building2 className="h-4 w-4" /> Empresas terceirizadas</TabsTrigger>
          <TabsTrigger value="responsibilities" className="gap-1"><Briefcase className="h-4 w-4" /> Atribuições por cargo</TabsTrigger>
          <TabsTrigger value="outsourced-professionals" className="gap-1"><UserCog className="h-4 w-4" /> Profissionais terceirizados</TabsTrigger>
          <TabsTrigger value="freelancers" className="gap-1"><UserCheck className="h-4 w-4" /> Freelancers</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesList />
        </TabsContent>

        <TabsContent value="outsourced-companies">
          <OutsourcedCompaniesPanel />
        </TabsContent>

        <TabsContent value="responsibilities">
          <PositionResponsibilitiesPanel />
        </TabsContent>

        <TabsContent value="outsourced-professionals">
          <OutsourcedProfessionalsPanel />
        </TabsContent>

        <TabsContent value="freelancers">
          <FreelancersPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
