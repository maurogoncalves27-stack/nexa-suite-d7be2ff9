import { Stethoscope, History, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import NutriVisitReportPanel from "@/components/nutricontrol/NutriVisitReportPanel";
import { NutriStoreSelector } from "@/components/nutricontrol/NutriStoreSelector";

export default function NutriVisit() {
  const { isAdmin } = useAuth();
  const [showManager, setShowManager] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const find = () => {
      const el = document.getElementById("nutri-header-slot");
      if (el) setSlot(el);
      else requestAnimationFrame(find);
    };
    find();
  }, []);

  const headerContent = (
    <>
      <div className="w-[150px] sm:w-[220px] min-w-0">
        <NutriStoreSelector value={storeId} onChange={setStoreId} />
      </div>
      <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0">
        <Link to="/nutri-visita/historico" title="Histórico">
          <History className="h-4 w-4" />
        </Link>
      </Button>
      {isAdmin && (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Gerenciar itens do checklist"
          onClick={() => setShowManager(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {slot && createPortal(headerContent, slot)}
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 min-w-0">
        <Stethoscope className="h-6 w-6 md:h-7 md:w-7 text-primary shrink-0" />
        <span className="truncate">Visita técnica</span>
      </h1>
      <NutriVisitReportPanel
        hideHistory
        managerOpen={showManager}
        onManagerChange={setShowManager}
        externalStoreId={storeId}
        hideStoreSelector
      />
    </div>
  );
}
