import { History, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const el = document.getElementById("nutri-header-slot");
    setSlot(el);
  }, []);

  const headerContent = (
    <>
      <div className="w-[160px] sm:w-[220px] min-w-0">
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
      {slot ? createPortal(headerContent, slot) : (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {headerContent}
        </div>
      )}
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
