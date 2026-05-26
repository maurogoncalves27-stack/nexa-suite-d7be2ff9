import { Stethoscope } from "lucide-react";
import MedicalCertificatesPanel from "@/components/medical/MedicalCertificatesPanel";

export default function MedicalCertificates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Stethoscope className="h-7 w-7 text-primary" />
          Atestados Médicos
        </h1>
        <p className="text-muted-foreground">Cadastro e análise de atestados.</p>
      </div>
      <MedicalCertificatesPanel />
    </div>
  );
}
