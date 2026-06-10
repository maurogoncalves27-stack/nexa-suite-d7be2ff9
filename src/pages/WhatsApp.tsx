import { lazy, Suspense } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WhatsAppAdmin = lazy(() => import("./WhatsAppAdmin"));
const WhatsAppCustomerAdmin = lazy(() => import("./WhatsAppCustomerAdmin"));

export default function WhatsApp() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          WhatsApp
        </h1>
        <p className="text-muted-foreground">
          Gerencie as configurações de notificações internas e o atendimento ao cliente.
        </p>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="config" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Configurações WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="customer" className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs sm:text-sm">WhatsApp Clientes</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <WhatsAppAdmin />
          </Suspense>
        </TabsContent>
        <TabsContent value="customer" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <WhatsAppCustomerAdmin />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
