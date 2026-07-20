import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, ShieldCheck, Handshake, Link2, Eye, Settings as SettingsIcon, FlaskConical, CreditCard, Monitor, KeyRound, Router, Bell, Wrench, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StoresPanel from "@/components/settings/StoresPanel";
import AccessControlPanel from "@/components/settings/AccessControlPanel";
import UserLinksPanel from "@/components/settings/UserLinksPanel";
import PartnersPanel from "@/components/settings/PartnersPanel";
import ExternalAccess from "@/pages/ExternalAccess";
import IntegrationsPage from "@/pages/IntegrationsPage";
import NotificationSettings from "@/pages/NotificationSettings";
import NetworkMonitor from "@/pages/NetworkMonitor";
import RemoteAccess from "@/pages/RemoteAccess";

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Wrench className="h-4 w-4" />
              Opções dev
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Ferramentas de homologação</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/configuracoes/tef-payer" className="cursor-pointer">
                <CreditCard className="h-4 w-4 mr-2" />
                TEF Payer
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/configuracoes/tef-paygo" className="cursor-pointer">
                <CreditCard className="h-4 w-4 mr-2" />
                TEF PayGo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/configuracoes/nfce-tester" className="cursor-pointer">
                <FlaskConical className="h-4 w-4 mr-2" />
                Teste NFC-e (ACBr)
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="stores" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-9 h-auto">
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
            <span className="text-xs sm:text-sm">Externos</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <KeyRound className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Integrações</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Bell className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Alertas</span>
          </TabsTrigger>
          <TabsTrigger value="network" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Router className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Rede</span>
          </TabsTrigger>
          <TabsTrigger value="remote" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <Monitor className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Remoto</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="mt-4"><StoresPanel /></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessControlPanel /></TabsContent>
        <TabsContent value="links" className="mt-4"><UserLinksPanel /></TabsContent>
        <TabsContent value="partners" className="mt-4"><PartnersPanel /></TabsContent>
        <TabsContent value="external" className="mt-4"><ExternalAccess /></TabsContent>
        <TabsContent value="integrations" className="mt-4"><IntegrationsSettings /></TabsContent>
        <TabsContent value="alerts" className="mt-4"><NotificationSettings /></TabsContent>
        <TabsContent value="network" className="mt-4"><StoreNetwork /></TabsContent>
        <TabsContent value="remote" className="mt-4"><RemoteAccess /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
