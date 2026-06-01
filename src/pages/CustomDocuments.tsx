import { FileSpreadsheet } from "lucide-react";
import CustomDocumentsPanel from "@/components/announcements/CustomDocumentsPanel";

export default function CustomDocuments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Termos e circulares
        </h1>
        <p className="text-muted-foreground">Crie e gerencie termos e circulares para assinatura dos colaboradores.</p>
      </div>
      <CustomDocumentsPanel />
    </div>
  );
}
