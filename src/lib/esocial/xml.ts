// Helpers de leitura de XML (ignoram namespace, buscam por localName)

export const text = (el: Element | null | undefined): string | null => {
  if (!el) return null;
  const t = el.textContent?.trim();
  return t && t.length > 0 ? t : null;
};

export const num = (el: Element | null | undefined): number | null => {
  const t = text(el);
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const find = (parent: Element | Document, localName: string): Element | null => {
  const all = parent.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === localName) return el;
  }
  return null;
};

export const findAll = (parent: Element | Document, localName: string): Element[] => {
  const out: Element[] = [];
  const all = parent.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
};

export const parseXmlString = (xmlString: string): Document => {
  const trimmed = (xmlString ?? "").trim();
  if (!trimmed) {
    throw new Error("Arquivo XML vazio. Verifique se o arquivo enviado contém o evento eSocial S-1200.");
  }
  if (!trimmed.startsWith("<")) {
    throw new Error("Arquivo não parece ser um XML válido. Para folha em PDF/Excel, use as extensões .pdf, .xls ou .xlsx.");
  }
  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    // Mensagem mais curta e amigável (sem o "rendering of the page" do navegador)
    throw new Error("XML inválido ou mal formatado. Confirme que o arquivo é um evento eSocial S-1200 válido.");
  }
  return doc;
};
