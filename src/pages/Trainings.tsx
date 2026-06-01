import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, ListChecks, Users, History } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TrainingCriteriaPanel from "@/components/training/TrainingCriteriaPanel";
import TrainingDashboard from "@/components/training/TrainingDashboard";
import TrainingHistoryPanel from "@/components/training/TrainingHistoryPanel";

export interface TrainingCriterion {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  is_active: boolean;
}

export default function Trainings() {
  const [criteria, setCriteria] = useState<TrainingCriterion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCriteria = async () => {
    const { data, error } = await supabase
      .from("training_criteria")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Erro ao carregar critérios", description: error.message, variant: "destructive" });
    }
    setCriteria((data ?? []) as TrainingCriterion[]);
    setLoading(false);
  };

  useEffect(() => { loadCriteria(); }, []);

  const activeCriteria = criteria.filter((c) => c.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Treinamentos
        </h1>
        <p className="text-muted-foreground">
          Treinamento de 7 dias para novos colaboradores. Avaliação diária por critérios próprios. Admissão somente após aprovação.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid grid-cols-3 sm:flex h-auto w-full sm:w-auto gap-1">
              <TabsTrigger value="dashboard" className="gap-2">
                <Users className="h-4 w-4" /> <span className="hidden sm:inline">Em treinamento</span><span className="sm:hidden">Treinando</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" /> Histórico
              </TabsTrigger>
              <TabsTrigger value="criteria" className="gap-2">
                <ListChecks className="h-4 w-4" /> Critérios
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <TrainingDashboard criteria={activeCriteria} loadingCriteria={loading} />
            </TabsContent>
            <TabsContent value="history">
              <TrainingHistoryPanel criteria={criteria} />
            </TabsContent>
            <TabsContent value="criteria">
              <TrainingCriteriaPanel criteria={criteria} onChange={loadCriteria} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
