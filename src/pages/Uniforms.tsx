import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shirt } from "lucide-react";
import { UniformItemsPanel } from "@/components/uniforms/UniformItemsPanel";
import { UniformKitsPanel } from "@/components/uniforms/UniformKitsPanel";
import { UniformStockPanel } from "@/components/uniforms/UniformStockPanel";
import { UniformDeliveriesPanel } from "@/components/uniforms/UniformDeliveriesPanel";
import { UniformDashboardPanel } from "@/components/uniforms/UniformDashboardPanel";
import type { UniformItem } from "@/lib/uniforms";
import { sortStores } from "@/lib/storeSort";

export default function Uniforms() {
  const [items, setItems] = useState<UniformItem[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; position: string | null; store_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = async () => {
    const { data } = await supabase.from("uniform_items").select("*").order("name");
    setItems((data ?? []) as UniformItem[]);
  };

  useEffect(() => {
    const init = async () => {
      const [{ data: sto }, { data: emp }] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
        supabase.from("employees").select("id, full_name, position, store_id").eq("status", "active").order("full_name"),
      ]);
      setStores(sortStores(sto ?? []));
      setEmployees(emp ?? []);
      await loadItems();
      setLoading(false);
    };
    init();
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shirt className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">Controle de Uniformes</h1>
          <p className="text-muted-foreground">Catálogo, kits por cargo, estoque e entregas</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1 sm:w-auto sm:inline-flex sm:flex-nowrap">
          <TabsTrigger value="dashboard" className="flex-1 sm:flex-none text-xs sm:text-sm min-w-[5rem]">Dashboard</TabsTrigger>
          <TabsTrigger value="catalog" className="flex-1 sm:flex-none text-xs sm:text-sm min-w-[5rem]">Catálogo</TabsTrigger>
          <TabsTrigger value="kits" className="flex-1 sm:flex-none text-xs sm:text-sm min-w-[5rem]">Kits</TabsTrigger>
          <TabsTrigger value="stock" className="flex-1 sm:flex-none text-xs sm:text-sm min-w-[5rem]">Estoque</TabsTrigger>
          <TabsTrigger value="deliveries" className="flex-1 sm:flex-none text-xs sm:text-sm min-w-[5rem]">Entregas</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <UniformDashboardPanel items={items} stores={stores} />
        </TabsContent>
        <TabsContent value="catalog">
          <UniformItemsPanel items={items} onChanged={loadItems} />
        </TabsContent>
        <TabsContent value="kits">
          <UniformKitsPanel items={items} />
        </TabsContent>
        <TabsContent value="stock">
          <UniformStockPanel items={items} stores={stores} />
        </TabsContent>
        <TabsContent value="deliveries">
          <UniformDeliveriesPanel items={items} stores={stores} employees={employees} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
