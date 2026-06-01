import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, ClipboardList, Users, History as HistoryIcon, ListChecks, ClipboardCheck } from "lucide-react";
import EmployeeChecklists from "@/components/checklists/EmployeeChecklists";
import AdminTemplatesPanel from "@/components/checklists/AdminTemplatesPanel";
import AdminGroupsPanel from "@/components/checklists/AdminGroupsPanel";
import AdminDashboardPanel from "@/components/checklists/AdminDashboardPanel";
import AdminHistoryPanel from "@/components/checklists/AdminHistoryPanel";

export default function Checklists() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;

  if (!isStaff) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Check-lists
          </h1>
          <p className="text-muted-foreground">Acompanhe e responda os check-lists atribuídos a você</p>
        </div>
        <EmployeeChecklists />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          Check-lists
        </h1>
        <p className="text-muted-foreground">Gestão de templates, grupos, histórico e acompanhamento dos check-lists</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4 w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap h-auto w-full lg:w-auto gap-2 p-2 [&_svg]:!size-5 sm:[&_svg]:!size-6 lg:[&_svg]:!size-8">
          <TabsTrigger value="dashboard" className="gap-2 lg:gap-4 text-xs sm:text-sm lg:text-lg px-2 sm:px-4 lg:px-8 py-3 lg:py-4 min-h-[52px] lg:min-h-[64px] flex-col sm:flex-row">
            <LayoutDashboard /> Painel
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 lg:gap-4 text-xs sm:text-sm lg:text-lg px-2 sm:px-4 lg:px-8 py-3 lg:py-4 min-h-[52px] lg:min-h-[64px] flex-col sm:flex-row">
            <ClipboardList /> Check-lists
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2 lg:gap-4 text-xs sm:text-sm lg:text-lg px-2 sm:px-4 lg:px-8 py-3 lg:py-4 min-h-[52px] lg:min-h-[64px] flex-col sm:flex-row">
            <Users /> Grupos
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 lg:gap-4 text-xs sm:text-sm lg:text-lg px-2 sm:px-4 lg:px-8 py-3 lg:py-4 min-h-[52px] lg:min-h-[64px] flex-col sm:flex-row">
            <HistoryIcon /> Histórico
          </TabsTrigger>
          <TabsTrigger value="my" className="col-span-2 sm:col-span-1 gap-2 lg:gap-4 text-xs sm:text-sm lg:text-lg px-2 sm:px-4 lg:px-8 py-3 lg:py-4 min-h-[52px] lg:min-h-[64px] flex-col sm:flex-row">
            <ListChecks /> Meus check-lists
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="w-full"><AdminDashboardPanel /></TabsContent>
        <TabsContent value="templates" className="w-full"><AdminTemplatesPanel /></TabsContent>
        <TabsContent value="groups" className="w-full"><AdminGroupsPanel /></TabsContent>
        <TabsContent value="history" className="w-full"><AdminHistoryPanel /></TabsContent>
        <TabsContent value="my" className="w-full"><EmployeeChecklists /></TabsContent>
      </Tabs>
    </div>
  );
}

