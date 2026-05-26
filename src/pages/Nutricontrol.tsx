import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, UserCheck, Thermometer, PackageCheck, Droplet, Bug, Wrench, Store } from "lucide-react";
import LabCoatIcon from "@/components/icons/LabCoatIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NutriStoreSelector } from "@/components/nutricontrol/NutriStoreSelector";
import { NutriDailyChecklist } from "@/components/nutricontrol/NutriDailyChecklist";
import { NutriTemperatureControl } from "@/components/nutricontrol/NutriTemperatureControl";
import { NutriMerchandiseControl } from "@/components/nutricontrol/NutriMerchandiseControl";
import { NutriOilQualityControl } from "@/components/nutricontrol/NutriOilQualityControl";
import { NutriOilDisposalControl } from "@/components/nutricontrol/NutriOilDisposalControl";
import { NutriPestControl } from "@/components/nutricontrol/NutriPestControl";
import { NutriMaintenanceControl } from "@/components/nutricontrol/NutriMaintenanceControl";

const Nutricontrol = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [storeId, setStoreId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ["higiene", "temperatura", "mercadoria", "oleo", "pragas", "manutencao"];
  const initialTab = validTabs.includes(searchParams.get("tab") ?? "") ? (searchParams.get("tab") as string) : "higiene";
  const [activeTab, setActiveTab] = useState(initialTab);
  const dateDisplay = format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && validTabs.includes(t) && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <LabCoatIcon className="h-7 w-7 text-primary" />
            NutriControle
          </h1>
          <p className="text-muted-foreground">
            Controles diários de boas práticas em manipulação de alimentos
          </p>
        </div>
        <NutriStoreSelector value={storeId} onChange={(v) => setStoreId(v ? v : null)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base capitalize">{dateDisplay}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentDate((d) => subDays(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentDate((d) => addDays(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!storeId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Store className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Selecione uma loja para visualizar os controles.</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1 p-1">
                <TabsTrigger value="higiene" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <UserCheck className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Higiene</span>
                </TabsTrigger>
                <TabsTrigger value="temperatura" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <Thermometer className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Temperatura</span>
                </TabsTrigger>
                <TabsTrigger value="mercadoria" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <PackageCheck className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Mercadoria</span>
                </TabsTrigger>
                <TabsTrigger value="oleo" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <Droplet className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Óleo</span>
                </TabsTrigger>
                <TabsTrigger value="pragas" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <Bug className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Pragas</span>
                </TabsTrigger>
                <TabsTrigger value="manutencao" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2 text-xs sm:text-sm">
                  <Wrench className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Manutenção</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="higiene" className="mt-4">
                <NutriDailyChecklist currentDate={currentDate} storeId={storeId} />
              </TabsContent>
              <TabsContent value="temperatura" className="mt-4">
                <NutriTemperatureControl currentDate={currentDate} storeId={storeId} />
              </TabsContent>
              <TabsContent value="mercadoria" className="mt-4">
                <NutriMerchandiseControl currentDate={currentDate} storeId={storeId} />
              </TabsContent>
              <TabsContent value="oleo" className="mt-4">
                <NutriOilQualityControl currentDate={currentDate} storeId={storeId} />
                <NutriOilDisposalControl storeId={storeId} />
              </TabsContent>
              <TabsContent value="pragas" className="mt-4">
                <NutriPestControl currentDate={currentDate} storeId={storeId} />
              </TabsContent>
              <TabsContent value="manutencao" className="mt-4 space-y-4">
                <NutriMaintenanceControl currentDate={currentDate} storeId={storeId} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Nutricontrol;
