/**
 * /configuracoes/tef — página única de TEF com abas (PayGo, Payer, Terminal SmartPOS).
 */
import { useSearchParams } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TefPaygoSetup from "./TefPaygoSetup";
import TefPayerSetup from "./TefPayerSetup";
import SmartPosConfig from "./SmartPosConfig";

const VALID = ["paygo", "payer", "terminal"] as const;

export default function TefSetup() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") ?? "paygo";
  const tab = (VALID as readonly string[]).includes(raw) ? raw : "paygo";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          TEF
        </h1>
        <p className="text-muted-foreground">
          Configuração e testes de pagamento: PayGo, Payer e terminal SmartPOS.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v }, { replace: true })}
        className="w-full"
      >
        <TabsList className="w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="paygo">PayGo</TabsTrigger>
          <TabsTrigger value="payer">Payer</TabsTrigger>
          <TabsTrigger value="terminal">Terminal SmartPOS</TabsTrigger>
        </TabsList>

        <TabsContent value="paygo" className="mt-4">
          <TefPaygoSetup embedded />
        </TabsContent>
        <TabsContent value="payer" className="mt-4">
          <TefPayerSetup embedded />
        </TabsContent>
        <TabsContent value="terminal" className="mt-4">
          <SmartPosConfig embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
