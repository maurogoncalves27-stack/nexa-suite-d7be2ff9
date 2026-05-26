import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InfractionsPanel from "./InfractionsPanel";
import InfractionTypesPanel from "./InfractionTypesPanel";
import WarningsPanel from "./WarningsPanel";
import type { Cycle } from "@/pages/Evaluations";

export default function InfractionsTab({ cycles }: { cycles: Cycle[] }) {
  return (
    <Tabs defaultValue="occurrences" className="space-y-4">
      <TabsList>
        <TabsTrigger value="occurrences">Ocorrências</TabsTrigger>
        <TabsTrigger value="warnings">Advertências</TabsTrigger>
        <TabsTrigger value="types">Tipos de infração</TabsTrigger>
      </TabsList>

      <TabsContent value="occurrences">
        <InfractionsPanel cycles={cycles} />
      </TabsContent>

      <TabsContent value="warnings">
        <WarningsPanel />
      </TabsContent>

      <TabsContent value="types">
        <InfractionTypesPanel />
      </TabsContent>
    </Tabs>
  );
}
