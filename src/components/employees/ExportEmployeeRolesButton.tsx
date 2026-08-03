import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { generateEmployeeRolesPdf } from "@/lib/employeeRolesPdf";

export default function ExportEmployeeRolesButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const doc = await generateEmployeeRolesPdf();
      doc.save(`colaboradores-cargos-atribuicoes-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "PDF gerado", description: "Lista de colaboradores, cargos e atribuições." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="w-full sm:w-auto">
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
      Exportar PDF (cargos e atribuições)
    </Button>
  );
}
