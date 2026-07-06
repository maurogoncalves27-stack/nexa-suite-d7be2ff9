import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import MedicalCertificates from "./MedicalCertificates";
import Pcmso from "./Pcmso";
import MentalHealth from "./MentalHealth";
import SstDocumentsPanel from "@/components/sst/SstDocumentsPanel";

type TabKey = "atestados" | "pcmso" | "saude-mental" | "documentos-sst";

export default function OccupationalHealth() {
  const [params, setParams] = useSearchParams();
  const { roles, isAdmin, isManager, isContabilidade } = useAuth();

  const canAtestados = isAdmin || isManager || roles.includes("hr") || isContabilidade;
  const canPcmso = isAdmin || isManager || roles.includes("hr") || roles.includes("mental_health");
  const canMental = isAdmin || roles.includes("hr") || roles.includes("mental_health");
  const canSstDocs = isAdmin || isManager || roles.includes("hr") || isContabilidade;

  const availableTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string }[] = [];
    if (canAtestados) tabs.push({ key: "atestados", label: "Atestados" });
    if (canPcmso) tabs.push({ key: "pcmso", label: "PCMSO (colaborador)" });
    if (canSstDocs) tabs.push({ key: "documentos-sst", label: "Documentos SST" });
    if (canMental) tabs.push({ key: "saude-mental", label: "Saúde Mental" });
    return tabs;
  }, [canAtestados, canPcmso, canMental, canSstDocs]);

  if (availableTabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  const requested = params.get("tab") as TabKey | null;
  const active: TabKey =
    requested && availableTabs.some((t) => t.key === requested)
      ? requested
      : availableTabs[0].key;

  const setActive = (key: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <HeartPulse className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Saúde Ocupacional
        </h1>
        <p className="text-muted-foreground">Atestados, PCMSO e saúde mental (NR-1) em um só lugar.</p>
      </div>

      {availableTabs.length === 1 ? (
        <SingleTab tab={availableTabs[0].key} />
      ) : (
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="w-full sm:w-auto flex-wrap h-auto">
            {availableTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-1 sm:flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {canAtestados && (
            <TabsContent value="atestados" className="mt-4">
              <MedicalCertificates embedded />
            </TabsContent>
          )}
          {canPcmso && (
            <TabsContent value="pcmso" className="mt-4">
              <Pcmso embedded />
            </TabsContent>
          )}
          {canSstDocs && (
            <TabsContent value="documentos-sst" className="mt-4">
              <SstDocumentsPanel />
            </TabsContent>
          )}
          {canMental && (
            <TabsContent value="saude-mental" className="mt-4">
              <MentalHealth embedded />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

function SingleTab({ tab }: { tab: TabKey }) {
  if (tab === "atestados") return <MedicalCertificates embedded />;
  if (tab === "pcmso") return <Pcmso embedded />;
  if (tab === "documentos-sst") return <SstDocumentsPanel />;
  return <MentalHealth embedded />;
}
