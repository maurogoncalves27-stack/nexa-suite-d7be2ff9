import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, ClipboardList, Users, History as HistoryIcon } from "lucide-react";
import AdminTemplatesPanel from "@/components/checklists/AdminTemplatesPanel";
import AdminGroupsPanel from "@/components/checklists/AdminGroupsPanel";
import AdminDashboardPanel from "@/components/checklists/AdminDashboardPanel";
import AdminHistoryPanel from "@/components/checklists/AdminHistoryPanel";

/**
 * Painel completo do sistema de Checklists para uso embutido (ex.: dentro da
 * Área do Gestor → aba Checklists). Replica todas as abas da página /checklists.
 */
export default function ChecklistsFullPanel() {
  return (
    <div className="space-y-4 w-full">
      <Tabs defaultValue="dashboard" className="space-y-4 w-full">
        <TabsList className="grid grid-cols-2 sm:flex sm:flex-wrap h-auto w-full sm:w-auto gap-2 p-2 [&_svg]:!size-5 sm:[&_svg]:!size-8">
          <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-lg px-2 sm:px-6 py-3 sm:py-4 min-h-[52px] sm:min-h-[64px] flex-col sm:flex-row">
            <LayoutDashboard /> Painel
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 text-xs sm:text-lg px-2 sm:px-6 py-3 sm:py-4 min-h-[52px] sm:min-h-[64px] flex-col sm:flex-row">
            <ClipboardList /> Check-lists
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2 text-xs sm:text-lg px-2 sm:px-6 py-3 sm:py-4 min-h-[52px] sm:min-h-[64px] flex-col sm:flex-row">
            <Users /> Grupos
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 text-xs sm:text-lg px-2 sm:px-6 py-3 sm:py-4 min-h-[52px] sm:min-h-[64px] flex-col sm:flex-row">
            <HistoryIcon /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="w-full"><AdminDashboardPanel /></TabsContent>
        <TabsContent value="templates" className="w-full"><AdminTemplatesPanel /></TabsContent>
        <TabsContent value="groups" className="w-full"><AdminGroupsPanel /></TabsContent>
        <TabsContent value="history" className="w-full"><AdminHistoryPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
