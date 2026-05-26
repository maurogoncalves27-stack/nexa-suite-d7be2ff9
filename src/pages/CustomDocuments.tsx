import { FileSignature } from "lucide-react";
import CustomDocumentsPanel from "@/components/announcements/CustomDocumentsPanel";

export default function CustomDocuments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <FileSignature className="h-7 w-7 text-primary" />
          Termos e circulares
        </h1>
        <p className="text-muted-foreground">Crie e gerencie termos e circulares para assinatura dos colaboradores.</p>
      </div>
      <CustomDocumentsPanel />
    </div>
  );
}
