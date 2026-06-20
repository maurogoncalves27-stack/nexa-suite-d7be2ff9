import { Headset } from "lucide-react";

export default function CRM() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Headset className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          CRM
        </h1>
        <p className="text-muted-foreground">
          Gestão de relacionamento com clientes. Em breve integração com o CRM externo.
        </p>
      </div>
    </div>
  );
}
