import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, ShieldCheck, Handshake, Link2, Eye, Settings as SettingsIcon, FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import StoresPanel from "@/components/settings/StoresPanel";
import AccessControlPanel from "@/components/settings/AccessControlPanel";
import UserLinksPanel from "@/components/settings/UserLinksPanel";
import PartnersPanel from "@/components/settings/PartnersPanel";
import ExternalAccess from "@/pages/ExternalAccess";

const Settings = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Configurações
          </h1>
          <p className="text-muted-foreground">Centralize aqui as configurações do sistema.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/configuracoes/nfce-tester">
            <FlaskConical className="h-4 w-4" />
            Teste NFC-e (ACBr)
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="stores" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="stores" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Store className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Lojas</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Acessos</span>
          </TabsTrigger>
          <TabsTrigger value="links" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Link2 className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Vincular login</span>
          </TabsTrigger>
          <TabsTrigger value="partners" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Eye className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Sócios</span>
          </TabsTrigger>
          <TabsTrigger value="external" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Handshake className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Acessos externos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="mt-4"><StoresPanel /></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessControlPanel /></TabsContent>
        <TabsContent value="links" className="mt-4"><UserLinksPanel /></TabsContent>
        <TabsContent value="partners" className="mt-4"><PartnersPanel /></TabsContent>
        <TabsContent value="external" className="mt-4"><ExternalAccess /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
