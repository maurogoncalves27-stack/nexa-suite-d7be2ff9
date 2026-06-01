import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, CalendarClock } from "lucide-react";
import AnnouncementsManagerPanel from "@/components/announcements/AnnouncementsManagerPanel";
import AppointmentsManagerPanel from "@/components/announcements/AppointmentsManagerPanel";

export default function Announcements() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Avisos e agenda
        </h1>
        <p className="text-muted-foreground">Publique comunicados e agende compromissos para os colaboradores.</p>
      </div>

      <Tabs defaultValue="avisos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex">
          <TabsTrigger value="avisos" className="gap-2">
            <Megaphone className="h-4 w-4" />Avisos
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <CalendarClock className="h-4 w-4" />Agenda
          </TabsTrigger>
        </TabsList>
        <TabsContent value="avisos" className="mt-4">
          <AnnouncementsManagerPanel />
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <AppointmentsManagerPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
