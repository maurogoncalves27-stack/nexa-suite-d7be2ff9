import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Mode = "sintetica" | "analitica";

interface Props {
  buildSnapshot: () => Promise<Record<string, any>> | Record<string, any>;
}

export default function DashboardAiDiagnosisButton({ buildSnapshot }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("sintetica");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Record<Mode, string | null>>({ sintetica: null, analitica: null });

  const run = async (m: Mode) => {
    setMode(m);
    if (analysis[m]) return;
    setLoading(true);
    try {
      const snapshot = await buildSnapshot();
      const { data, error } = await supabase.functions.invoke("dashboard-ai-diagnosis", {
        body: { mode: m, snapshot },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalysis((prev) => ({ ...prev, [m]: data?.analysis ?? "Sem resposta." }));
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao gerar diagnóstico", { description: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  const openDialog = async () => {
    setOpen(true);
    if (!analysis.sintetica) await run("sintetica");
  };

  return (
    <>
      <Button onClick={openDialog} variant="outline" size="sm" className="gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        Diagnóstico por IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Diagnóstico por IA — NEXA
            </DialogTitle>
          </DialogHeader>
          <Tabs value={mode} onValueChange={(v) => run(v as Mode)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="sintetica">Sintético</TabsTrigger>
              <TabsTrigger value="analitica">Analítico</TabsTrigger>
            </TabsList>
            {(["sintetica", "analitica"] as const).map((m) => (
              <TabsContent key={m} value={m} className="mt-4">
                {loading && mode === m ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando dados…
                  </div>
                ) : analysis[m] ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{analysis[m]!}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Clique na aba para gerar.</p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
