import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTermsForPosition } from "@/lib/positionTerms";
import { getActiveContractTemplate } from "@/lib/contractPdf";

interface DocumentsPendingBannerProps {
  employeePosition?: string | null;
  employeeContractType?: string | null;
}

/**
 * Banner persistente de pendências de assinatura de documentos do colaborador.
 * Exibido junto aos demais avisos do sistema (clima, aniversários, infrações).
 */
export default function DocumentsPendingBanner({ employeePosition, employeeContractType }: DocumentsPendingBannerProps) {
  const { user } = useAuth();
  const [pendingItems, setPendingItems] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const positionTerms = getTermsForPosition(employeePosition);

      const [{ data: regData }, { data: termsData }] = await Promise.all([
        supabase
          .from("internal_regulation_acceptances")
          .select("id")
          .eq("user_id", user.id)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("position_term_acceptances")
          .select("term_key, term_version")
          .eq("user_id", user.id),
      ]);

      let contractPending = false;
      const isIntern = (() => {
        const v = (employeeContractType ?? "").toLowerCase();
        return v.includes("estág") || v.includes("estag") || v === "internship";
      })();
      if (!isIntern) {
        try {
          const tpl = await getActiveContractTemplate();
          if (tpl) {
            const { data: sig } = await supabase
              .from("contract_signatures")
              .select("id")
              .eq("user_id", user.id)
              .is("superseded_at", null)
              .limit(1)
              .maybeSingle();
            contractPending = !sig;
          }
        } catch {
          contractPending = false;
        }
      }

      // Documentos personalizados pendentes
      let customDocsPending = 0;
      if (employeePosition) {
        const { data: docs } = await supabase
          .from("custom_documents")
          .select("id, current_version")
          .eq("is_active", true);
        const docList = docs ?? [];
        if (docList.length > 0) {
          const docIds = docList.map((d) => d.id);
          const [{ data: vers }, { data: sigs }] = await Promise.all([
            supabase
              .from("custom_document_versions")
              .select("document_id, version_number, target_positions")
              .in("document_id", docIds),
            supabase
              .from("custom_document_signatures")
              .select("document_id, version_number")
              .eq("user_id", user.id)
              .in("document_id", docIds),
          ]);
          const signed = new Set(
            ((sigs ?? []) as any[]).map((s) => `${s.document_id}::${s.version_number}`),
          );
          for (const d of docList) {
            const v = ((vers ?? []) as any[]).find(
              (x) => x.document_id === d.id && x.version_number === d.current_version,
            );
            if (!v) continue;
            if (!v.target_positions?.includes(employeePosition)) continue;
            if (signed.has(`${d.id}::${d.current_version}`)) continue;
            customDocsPending++;
          }
        }
      }

      const items: string[] = [];
      if (!regData) items.push("Regimento Interno");
      if (contractPending) items.push("Contrato de Trabalho");
      const acceptedKeys = new Set(
        ((termsData ?? []) as any[]).map((a) => `${a.term_key}::${a.term_version}`),
      );
      for (const term of positionTerms) {
        if (!acceptedKeys.has(`${term.key}::${term.version}`)) items.push(term.title);
      }
      if (customDocsPending > 0) {
        items.push(
          `${customDocsPending} documento${customDocsPending > 1 ? "s" : ""} personalizado${customDocsPending > 1 ? "s" : ""}`,
        );
      }

      if (!cancelled) {
        setPendingItems(items);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, employeePosition, employeeContractType]);

  if (!loaded || pendingItems.length === 0) return null;

  return (
    <Alert className="border-warning/60 bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="font-semibold">
        {pendingItems.length === 1
          ? "Documento sem assinatura"
          : `${pendingItems.length} documentos sem assinatura`}
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">Acesse a aba <strong>Docs</strong> para assinar:</p>
        <ul className="list-disc pl-5 space-y-0.5 text-sm">
          {pendingItems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
