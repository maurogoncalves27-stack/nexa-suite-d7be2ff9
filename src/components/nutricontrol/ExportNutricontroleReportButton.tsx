import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { generateNutricontroleReportPdf, type NutriReportData } from "@/lib/nutricontroleReportPdf";

interface Props {
  storeId: string | null;
}

export default function ExportNutricontroleReportButton({ storeId }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!storeId) {
      toast({ title: "Selecione uma loja", description: "Escolha a loja para gerar o relatório.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const to = new Date();
      const from = subMonths(to, 3);
      const fromISO = format(from, "yyyy-MM-dd");
      const toISO = format(to, "yyyy-MM-dd");
      const fromTs = from.toISOString();
      const toTs = to.toISOString();

      const [store, checklist, temps, tempAlerts, merch, oilQ, oilD, pestC, pestO, maint, maintReq, water, equipments, items] = await Promise.all([
        supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
        supabase.from("nutri_day_records").select("date, item_id, sim_nao, note, user_id").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("date", { ascending: false }).limit(1000),
        supabase.from("nutri_temperature_readings").select("recorded_at, equipment_id, temperature, humidity, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("recorded_at", { ascending: false }).limit(1000),
        supabase.from("nutri_temperature_alerts").select("*").eq("store_id", storeId).gte("started_at", fromTs).lte("started_at", toTs).order("started_at", { ascending: false }).limit(500),
        supabase.from("nutri_merchandise_receipts").select("received_at, supplier, product_name, batch, temperature, storage_type, has_irregularity, is_return, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("received_at", { ascending: false }).limit(500),
        supabase.from("nutri_oil_quality_records").select("recorded_at, quality, changed, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("recorded_at", { ascending: false }).limit(500),
        supabase.from("nutri_oil_disposal_records").select("pickup_date, collector_name, liters, amount_received, notes").eq("store_id", storeId).gte("pickup_date", fromISO).lte("pickup_date", toISO).order("pickup_date", { ascending: false }).limit(200),
        supabase.from("nutri_pest_control_records").select("service_date, company_name, note, certificate_url").eq("store_id", storeId).gte("service_date", fromISO).lte("service_date", toISO).order("service_date", { ascending: false }).limit(200),
        supabase.from("nutri_pest_occurrences").select("recorded_at, pest_type, location, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("recorded_at", { ascending: false }).limit(200),
        supabase.from("nutri_maintenance_records").select("date, equipment_type, maintenance_type, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("date", { ascending: false }).limit(200),
        supabase.from("nutri_maintenance_requests").select("requested_at, equipment_type, description, urgency, status").eq("store_id", storeId).gte("requested_at", fromTs).lte("requested_at", toTs).order("requested_at", { ascending: false }).limit(200),
        supabase.from("nutri_water_tank_cleanings").select("cleaning_date, responsible, note, report_url").eq("store_id", storeId).gte("cleaning_date", fromISO).lte("cleaning_date", toISO).order("cleaning_date", { ascending: false }).limit(50),
        supabase.from("nutri_equipment").select("id, name"),
        supabase.from("nutri_items").select("id, name"),
      ]);

      const eqMap = new Map((equipments.data ?? []).map((e: any) => [e.id, e.name]));
      const itemMap = new Map((items.data ?? []).map((i: any) => [i.id, i.name]));

      const data: NutriReportData = {
        storeName: store.data?.name ?? "—",
        periodFrom: fromISO,
        periodTo: toISO,
        companyName: "NEXA Gestão Inteligente",
        dailyChecklist: (checklist.data ?? []).map((r: any) => ({
          date: r.date, item: itemMap.get(r.item_id) ?? "—", sim_nao: r.sim_nao, note: r.note ?? "", user: "",
        })),
        temperatures: (temps.data ?? []).map((r: any) => ({
          recorded_at: r.recorded_at, equipment: eqMap.get(r.equipment_id) ?? "—",
          temperature: Number(r.temperature), humidity: r.humidity != null ? Number(r.humidity) : null, note: r.note ?? "",
        })),
        temperatureAlerts: (tempAlerts.data ?? []).map((a: any) => ({
          started_at: a.started_at ?? a.created_at, equipment: eqMap.get(a.equipment_id) ?? "—",
          kind: a.kind ?? a.alert_type ?? "—", value: a.value != null ? Number(a.value) : null, resolved_at: a.resolved_at,
        })),
        merchandise: (merch.data ?? []) as any,
        oilQuality: (oilQ.data ?? []) as any,
        oilDisposal: (oilD.data ?? []) as any,
        pestControl: (pestC.data ?? []).map((c: any) => ({
          service_date: c.service_date, company_name: c.company_name, note: c.note ?? "", has_certificate: !!c.certificate_url,
        })),
        pestOccurrences: (pestO.data ?? []) as any,
        maintenance: (maint.data ?? []) as any,
        maintenanceRequests: (maintReq.data ?? []) as any,
        waterTank: (water.data ?? []).map((w: any) => ({
          cleaning_date: w.cleaning_date, responsible: w.responsible ?? "", note: w.note ?? "", has_report: !!w.report_url,
        })),
      };

      const doc = generateNutricontroleReportPdf(data);
      const safeName = (data.storeName || "loja").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      doc.save(`nutricontrole-${safeName}-${format(to, "yyyy-MM-dd")}.pdf`);
      toast({ title: "Relatório gerado", description: "PDF dos últimos 3 meses pronto para fiscalização." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading || !storeId}>
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
      Exportar PDF (3 meses)
    </Button>
  );
}
