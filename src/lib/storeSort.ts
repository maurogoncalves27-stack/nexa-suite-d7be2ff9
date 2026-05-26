// Utilitário de ordenação de lojas para exibição.
// Regra: lojas normais (filiais) primeiro em ordem alfabética; em seguida
// ESTOQUE CENTRAL e por último a FABRICA (matriz).

type StoreLike = {
  name?: string | null;
  store_type?: string | null;
};

const rank = (s: StoreLike): number => {
  const type = (s.store_type ?? "").toLowerCase();
  const name = (s.name ?? "").toUpperCase();
  if (type === "fabrica" || name === "FABRICA") return 2;
  if (type === "central" || name.includes("ESTOQUE CENTRAL")) return 1;
  return 0;
};

export function sortStores<T extends StoreLike>(stores: T[] | null | undefined): T[] {
  if (!stores) return [];
  return [...stores].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
  });
}
