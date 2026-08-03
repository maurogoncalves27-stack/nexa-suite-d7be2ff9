import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Gera o PDF "Colaboradores, cargos e atribuições".
 * Regras:
 *  - Apenas colaboradores ativos COM cargo cadastrado (registros sem cargo não são colaboradores).
 *  - Unidade = allocated_store_id (verdade) com fallback em store_id.
 *  - Atribuições vêm de position_responsibilities (ativas), casadas pelo nome do cargo.
 */
export async function generateEmployeeRolesPdf(): Promise<jsPDF> {
  const [empRes, storeRes, respRes] = await Promise.all([
    supabase
      .from("employees")
      .select("full_name, position, position_id, store_id, allocated_store_id")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("stores").select("id, name"),
    supabase
      .from("position_responsibilities")
      .select("position, responsibility, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (empRes.error) throw empRes.error;
  if (storeRes.error) throw storeRes.error;
  if (respRes.error) throw respRes.error;

  const storeMap = new Map((storeRes.data ?? []).map((s: any) => [s.id, s.name as string]));

  const norm = (v: string) => (v ?? "").trim().toLowerCase();
  const respMap = new Map<string, string[]>();
  (respRes.data ?? []).forEach((r: any) => {
    const key = norm(r.position);
    if (!respMap.has(key)) respMap.set(key, []);
    respMap.get(key)!.push(r.responsibility);
  });

  const rows = (empRes.data ?? [])
    .filter((e: any) => e.position_id && e.position)
    .map((e: any) => {
      const storeId = e.allocated_store_id ?? e.store_id;
      const atribs = respMap.get(norm(e.position)) ?? [];
      return [
        storeMap.get(storeId) ?? "—",
        e.full_name as string,
        e.position as string,
        atribs.length ? atribs.map((a) => `• ${a}`).join("\n") : "—",
      ];
    })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const today = format(new Date(), "dd/MM/yyyy");

  doc.setFontSize(14);
  doc.text("Colaboradores, cargos e atribuições", 14, 16);
  doc.setFontSize(9);
  doc.text(`NEXA Gestão Inteligente — ${rows.length} colaboradores ativos — ${today}`, 14, 22);

  autoTable(doc, {
    startY: 27,
    head: [["Unidade", "Colaborador", "Cargo", "Atribuições do cargo"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 42 },
      2: { cellWidth: 32 },
      3: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
  });

  return doc;
}
