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

      const [store, checklist, temps, tempAlerts, merch, oilQ, oilD, pestC, pestO, maint, maintReq, water, equipments, items, empByStore, schedEmps] = await Promise.all([
        supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
        supabase.from("nutri_day_records").select("date, item_id, sim_nao, note, user_id").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("date", { ascending: false }).limit(1000),
        supabase.from("nutri_temperature_readings").select("recorded_at, equipment_id, temperature, humidity, note").eq("store_id", storeId).gte("date", fromISO).lte("date", toISO).order("recorded_at", { ascending: false }).limit(1000),
        supabase.from("nutri_temperature_alerts").select("triggered_at, sensor_code, kind, last_temperature, resolved_at").eq("store_id", storeId).gte("triggered_at", fromTs).lte("triggered_at", toTs).order("triggered_at", { ascending: false }).limit(500),
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
        // Regra de alocação: allocated_store_id é a verdade; store_id só conta quando não há allocated_store_id
        supabase.from("employees").select("id, full_name, position, status, store_id, allocated_store_id").or(`allocated_store_id.eq.${storeId},and(allocated_store_id.is.null,store_id.eq.${storeId})`).eq("status", "active"),
        supabase.from("work_schedules").select("employee_id").eq("store_id", storeId).gte("schedule_date", fromISO).lte("schedule_date", toISO).limit(5000),
      ]);

      const eqMap = new Map((equipments.data ?? []).map((e: any) => [e.id, e.name]));
      const itemMap = new Map((items.data ?? []).map((i: any) => [i.id, i.name]));

      // Colaboradores alocados: por cadastro + por escala no período
      const empMap = new Map<string, { id: string; name: string; position: string }>();
      (empByStore.data ?? []).forEach((e: any) => empMap.set(e.id, { id: e.id, name: e.full_name, position: e.position ?? "" }));
      const schedIds = Array.from(new Set(((schedEmps.data ?? []) as any[]).map((r) => r.employee_id).filter(Boolean)));
      const missingIds = schedIds.filter((id) => !empMap.has(id));
      if (missingIds.length) {
        const { data: extras } = await supabase.from("employees").select("id, full_name, position, status").in("id", missingIds).eq("status", "active");
        (extras ?? []).forEach((e: any) => empMap.set(e.id, { id: e.id, name: e.full_name, position: e.position ?? "" }));
      }
      const empIds = Array.from(empMap.keys());
      const asoMap = new Map<string, { document_type: string; certificate_date: string; valid_until: string | null }>();
      if (empIds.length) {
        const { data: asoRows } = await supabase
          .from("medical_certificates")
          .select("employee_id, document_type, certificate_date, valid_until")
          .in("employee_id", empIds)
          .eq("is_pcmso", true)
          .eq("status", "approved")
          .order("certificate_date", { ascending: false });
        (asoRows ?? []).forEach((r: any) => {
          if (!asoMap.has(r.employee_id)) {
            asoMap.set(r.employee_id, { document_type: r.document_type, certificate_date: r.certificate_date, valid_until: r.valid_until });
          }
        });
      }
      const todayISO = format(new Date(), "yyyy-MM-dd");
      const in30ISO = format(new Date(Date.now() + 30 * 86400_000), "yyyy-MM-dd");
      const employeeAsos = Array.from(empMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => {
          const aso = asoMap.get(e.id);
          if (!aso) {
            return { employee_name: e.name, position: e.position, aso_type: "—", certificate_date: null, valid_until: null, status: "sem_aso" as const };
          }
          const vu = aso.valid_until
            ?? (aso.certificate_date ? format(new Date(new Date(aso.certificate_date).getTime() + 365 * 86400_000), "yyyy-MM-dd") : null);
          let status: "vigente" | "vence_em_30d" | "vencido" | "sem_aso" = "vigente";
          if (!vu) status = "vigente";
          else if (vu < todayISO) status = "vencido";
          else if (vu <= in30ISO) status = "vence_em_30d";
          return { employee_name: e.name, position: e.position, aso_type: aso.document_type, certificate_date: aso.certificate_date, valid_until: vu, status };
        });

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
          started_at: a.triggered_at, equipment: a.sensor_code ?? "—",
          kind: a.kind ?? "—", value: a.last_temperature != null ? Number(a.last_temperature) : null, resolved_at: a.resolved_at,
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
        employeeAsos,
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
