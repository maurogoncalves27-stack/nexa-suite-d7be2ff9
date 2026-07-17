import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import MedicalCertificates from "./MedicalCertificates";
import Pcmso from "./Pcmso";
import MentalHealth from "./MentalHealth";
import Climate from "./Climate";
import SstDocumentsPanel from "@/components/sst/SstDocumentsPanel";
import Nr1CompliancePanel from "@/components/occupational-health/Nr1CompliancePanel";
import PsychosocialRisksPanel from "@/components/occupational-health/PsychosocialRisksPanel";

type TabKey = "nr1" | "riscos-psicossociais" | "atestados" | "pcmso" | "saude-mental" | "documentos-sst" | "clima";

export default function OccupationalHealth() {
  const [params, setParams] = useSearchParams();
  const { roles, isAdmin, isManager, isContabilidade, user } = useAuth();

  const canAtestados = isAdmin || isManager || roles.includes("hr") || isContabilidade;
  const canPcmso = isAdmin || isManager || roles.includes("hr") || roles.includes("mental_health");
  const canMental = isAdmin || roles.includes("hr") || roles.includes("mental_health");
  const canSstDocs = isAdmin || isManager || roles.includes("hr") || isContabilidade;
  const canNr1 = isAdmin || isManager || roles.includes("hr");
  const canRiscos = isAdmin || roles.includes("hr") || roles.includes("mental_health") || isManager;
  const canClima = !!user;

  const availableTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string }[] = [];
    if (canNr1) tabs.push({ key: "nr1", label: "Painel NR-1" });
    if (canRiscos) tabs.push({ key: "riscos-psicossociais", label: "Riscos Psicossociais" });
    if (canAtestados) tabs.push({ key: "atestados", label: "Atestados" });
    if (canPcmso) tabs.push({ key: "pcmso", label: "PCMSO" });
    if (canSstDocs) tabs.push({ key: "documentos-sst", label: "Documentos SST" });
    if (canMental) tabs.push({ key: "saude-mental", label: "Saúde Mental" });
    if (canClima) tabs.push({ key: "clima", label: "Clima Organizacional" });
    return tabs;
  }, [canAtestados, canPcmso, canMental, canSstDocs, canNr1, canRiscos, canClima]);

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
        <p className="text-muted-foreground">
          Atestados, PCMSO, documentos SST, saúde mental e clima — tudo o que a NR-1 exige em um só lugar.
        </p>
      </div>

      {availableTabs.length === 1 ? (
        <SingleTab tab={availableTabs[0].key} onNavigate={setActive} />
      ) : (
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="w-full sm:w-auto flex-wrap h-auto">
            {availableTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-1 sm:flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {canNr1 && (
            <TabsContent value="nr1" className="mt-4">
              <Nr1CompliancePanel onNavigate={setActive} />
            </TabsContent>
          )}
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
          {canClima && (
            <TabsContent value="clima" className="mt-4">
              <Climate embedded />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

function SingleTab({ tab, onNavigate }: { tab: TabKey; onNavigate: (k: string) => void }) {
  if (tab === "nr1") return <Nr1CompliancePanel onNavigate={onNavigate} />;
  if (tab === "atestados") return <MedicalCertificates embedded />;
  if (tab === "pcmso") return <Pcmso embedded />;
  if (tab === "documentos-sst") return <SstDocumentsPanel />;
  if (tab === "clima") return <Climate />;
  return <MentalHealth embedded />;
}
