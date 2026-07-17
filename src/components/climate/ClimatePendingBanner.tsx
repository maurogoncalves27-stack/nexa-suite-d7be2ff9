import { Link, useLocation } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { useClimateStatus } from "@/hooks/useClimateStatus";

/**
 * Banner persistente que aparece em todas as páginas enquanto o colaborador
 * não tiver respondido a pesquisa de clima trimestral aberta.
 */
export default function ClimatePendingBanner() {
  const { openSurvey, pendingResponse, loading } = useClimateStatus();
  const { pathname } = useLocation();

  if (loading || !pendingResponse || !openSurvey) return null;
  // Já está na página de clima — não duplica o aviso.
  if (pathname.startsWith("/clima")) return null;

  return (
    <Alert className="border-warning/60 bg-warning/10">
      <ClipboardList className="h-4 w-4 text-warning" />
      <AlertTitle className="font-semibold">Pesquisa de clima pendente</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="text-sm">
          Sua participação em <strong>{openSurvey.name}</strong> é obrigatória. Leva menos de 3 minutos e é 100% anônima.
        </span>
        <Button asChild size="sm">
          <Link to="/clima">Responder agora</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
