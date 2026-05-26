import jsPDF from "jspdf";
import logoUrl from "@/assets/recipe-book-logo.png";

let cachedLogoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return cachedLogoDataUrl;
  } catch {
    return null;
  }
}

interface RecipeBookPdfData {
  title: string;
  description?: string | null;
  yield_text?: string | null;
  prep_time_minutes?: number | null;
  ingredients?: string | null;
  preparation_method?: string | null;
  photoDataUrl?: string | null;
}

/**
 * Layout do receituário:
 *  - A4 retrato
 *  - Título no topo em VERMELHO, negrito, centralizado
 *  - Bloco superior: FOTO à esquerda + TABELA de ingredientes à direita (QTDE | INGREDIENTES)
 *  - Bloco "MODO DE PREPARO/MONTAGEM:" com itens numerados abaixo
 */
export async function generateRecipeBookPdf(data: RecipeBookPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const margin = 15;
  const contentW = pageW - margin * 2;

  let y = margin + 4;

  // ===== LOGO (canto superior esquerdo, alinhada ao título) =====
  const logoData = await getLogoDataUrl();
  const logoSize = 24;
  const logoX = margin;
  const titleFontSize = 22;
  // baseline do título (em mm) ~ fontSize * 0.3528 * 0.75
  const titleHeight = titleFontSize * 0.3528;
  // centraliza verticalmente a logo com a linha do título
  const titleBaselineY = y + titleHeight; // posição do texto
  const logoY = titleBaselineY - titleHeight / 2 - logoSize / 2;
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
    } catch {
      // ignora
    }
  }

  // ===== TÍTULO (centralizado, com espaço reservado para a logo) =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleFontSize);
  doc.setTextColor(220, 38, 38); // vermelho
  const titleAvailW = contentW - (logoSize + 6) * 2; // simétrico para manter centralização
  const titleLines = doc.splitTextToSize(data.title.toUpperCase(), titleAvailW);
  doc.text(titleLines, pageW / 2, titleBaselineY, { align: "center" });
  y += Math.max(titleLines.length * 8 + 8, logoSize + 6);
  doc.setTextColor(0, 0, 0);


  // ===== PARSE INGREDIENTES =====
  // Aceita formatos: "1 kg coxa", "• 1 kg coxa", "500 g cebola", "1 KG - COSTELA",
  // "1/2 xícara de açúcar", "1 un óleo 900ml" -> qtde = "1 UN", nome = "ÓLEO 900ML".
  const UNIT_RE =
    /^(?:[•\-\*\u2022]\s*)?((?:\d+[\d.,/]*)\s*(?:kg|g|mg|l|ml|un|und|unid|unidade|unidades|cx|caixa|pct|pacote|dz|duzia|dúzia|colher(?:es)?(?:\s+de\s+(?:sopa|cha|chá))?|xicara|xícara|xicaras|xícaras|copo|copos|pitada|pitadas|fatia|fatias|dente|dentes|ramo|ramos|folha|folhas|lata|latas|garrafa|garrafas|saco|sacos|porção|porcao|porcoes|porções)?)\s*(?:de\s+|[-–—]\s*)?(.+)$/i;

  const ingRows: { qty: string; name: string }[] = (data.ingredients ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // remove bullet inicial
      const cleaned = line.replace(/^[•\-\*\u2022]\s*/, "").trim();
      // tenta primeiro " - "
      const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch && /\d/.test(dashMatch[1]) && dashMatch[1].length <= 18) {
        return { qty: dashMatch[1].trim().toUpperCase(), name: dashMatch[2].trim().toUpperCase() };
      }
      const m = cleaned.match(UNIT_RE);
      if (m) {
        return { qty: m[1].trim().toUpperCase().replace(/\s+/g, " "), name: m[2].trim().toUpperCase() };
      }
      // fallback: número solto + resto
      const num = cleaned.match(/^([\d.,/]+)\s+(.+)$/);
      if (num) return { qty: num[1].trim().toUpperCase(), name: num[2].trim().toUpperCase() };
      return { qty: "", name: cleaned.toUpperCase() };
    });

  // ===== BLOCO SUPERIOR: FOTO ESQUERDA + TABELA DIREITA =====
  const gap = 6;
  const photoW = data.photoDataUrl ? 75 : 0;
  const tableX = margin + (photoW > 0 ? photoW + gap : 0);
  const tableW = contentW - (photoW > 0 ? photoW + gap : 0);
  const colQtyW = Math.min(28, tableW * 0.28);
  const colNameW = tableW - colQtyW;
  const headerH = 8;
  const minRowH = 7;

  const blockTop = y;

  // helper bordas tracejadas
  const dashedRect = (x: number, ry: number, w: number, h: number) => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.2);
    doc.rect(x, ry, w, h);
    doc.setLineDashPattern([], 0);
  };

  // Cabeçalho da tabela com leve fundo
  doc.setFillColor(245, 245, 245);
  doc.rect(tableX, y, tableW, headerH, "F");
  dashedRect(tableX, y, colQtyW, headerH);
  dashedRect(tableX + colQtyW, y, colNameW, headerH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text("QTDE", tableX + colQtyW / 2, y + 5.4, { align: "center" });
  doc.text("INGREDIENTES", tableX + colQtyW + 3, y + 5.4);
  doc.setTextColor(0, 0, 0);
  let ty = y + headerH;

  // Linhas
  doc.setFontSize(10);
  if (ingRows.length === 0) {
    dashedRect(tableX, ty, colQtyW, minRowH);
    dashedRect(tableX + colQtyW, ty, colNameW, minRowH);
    doc.setTextColor(160, 160, 160);
    doc.text("—", tableX + colQtyW + 3, ty + 4.8);
    doc.setTextColor(0, 0, 0);
    ty += minRowH;
  } else {
    for (const r of ingRows) {
      const nameLines = doc.splitTextToSize(r.name || "—", colNameW - 6);
      const qtyLines = r.qty ? doc.splitTextToSize(r.qty, colQtyW - 4) : [""];
      const thisH = Math.max(minRowH, Math.max(nameLines.length, qtyLines.length) * 4.6 + 2.6);
      if (ty + thisH > pageH - margin - 10) {
        doc.addPage();
        ty = margin;
      }
      dashedRect(tableX, ty, colQtyW, thisH);
      dashedRect(tableX + colQtyW, ty, colNameW, thisH);
      doc.setFont("helvetica", "bold");
      doc.text(qtyLines, tableX + colQtyW / 2, ty + 4.8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(nameLines, tableX + colQtyW + 3, ty + 4.8);
      ty += thisH;
    }
  }

  // ===== FOTO (à esquerda, alinhada ao topo do bloco) =====
  if (data.photoDataUrl && photoW > 0) {
    try {
      const props = doc.getImageProperties(data.photoDataUrl);
      const ratio = props.width / props.height;
      const tableHeight = ty - blockTop;
      // altura disponível = altura da tabela (mantém alinhamento), com limite
      const maxImgH = Math.max(60, Math.min(tableHeight, 95));
      let imgW = photoW;
      let imgH = imgW / ratio;
      if (imgH > maxImgH) {
        imgH = maxImgH;
        imgW = imgH * ratio;
        if (imgW > photoW) {
          imgW = photoW;
          imgH = imgW / ratio;
        }
      }
      const imgX = margin + (photoW - imgW) / 2;
      const imgY = blockTop;
      const fmt = (props.fileType || "JPEG").toUpperCase();
      // moldura sutil
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.roundedRect(imgX - 1, imgY - 1, imgW + 2, imgH + 2, 1.5, 1.5);
      doc.addImage(data.photoDataUrl, fmt as "JPEG" | "PNG", imgX, imgY, imgW, imgH, undefined, "FAST");
    } catch {
      // ignora
    }
  }

  y = ty + 10;

  // ===== MODO DE PREPARO =====
  if (y > pageH - margin - 25) {
    doc.addPage();
    y = margin;
  }
  // título com barra vermelha à esquerda
  doc.setFillColor(220, 38, 38);
  doc.rect(margin, y - 4, 1.5, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text("MODO DE PREPARO / MONTAGEM", margin + 4, y + 1);
  y += 7;
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);

  const rawPrep = (data.preparation_method ?? "").trim() || "—";
  const prepSteps = rawPrep
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*\d+\s*[.)\-–—]?\s*/, "").trim())
    .filter(Boolean);

  const stepIndent = 8;
  for (let i = 0; i < prepSteps.length; i++) {
    const step = prepSteps[i];
    const numLabel = `${i + 1}.`;
    const stepLines = doc.splitTextToSize(step, contentW - stepIndent);
    const blockH = stepLines.length * 5 + 3;
    if (y + blockH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38);
    doc.text(numLabel, margin, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text(stepLines, margin + stepIndent, y + 4);
    y += blockH;
  }

  if (prepSteps.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text("—", margin, y + 4);
    doc.setTextColor(0, 0, 0);
  }

  const safeName = data.title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "receituario";
  doc.save(`${safeName}.pdf`);
}

/** Converte uma URL pública de imagem em data URL (base64). */
export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
