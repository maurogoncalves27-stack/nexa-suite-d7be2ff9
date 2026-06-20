import { MapPin, UtensilsCrossed, ShoppingBag, Bike } from "lucide-react";
import { Reveal } from "./reveal";

export type Service = "mesa" | "delivery" | "retirada";

export const STORES: { name: string; address: string; services: readonly Service[] }[] = [
  { name: "Águas Claras", address: "Quadra 101 – Rua das Figueiras, 6, Loja 15 – Águas Claras-DF · CEP 71906-750", services: ["delivery", "retirada"] },
  { name: "Asa Sul", address: "CRS 513 Bloco B, Loja 79 – Asa Sul, Brasília-DF · CEP 70380-520", services: ["delivery", "retirada"] },
  { name: "Asa Norte", address: "CLN 114 Bloco B, Loja 60 – Asa Norte, Brasília-DF · CEP 70764-520", services: ["mesa", "delivery", "retirada"] },
  { name: "Lago Sul", address: "SMDB Conj. 12, PAC 2 Parte 2 – Lago Sul, Brasília-DF · CEP 71680-116", services: ["delivery", "retirada"] },
];

const serviceLabels: Record<string, { label: string; icon: React.ReactNode; highlighted?: boolean }> = {
  mesa: { label: "Atendimento de mesa", icon: <UtensilsCrossed className="h-3.5 w-3.5" />, highlighted: true },
  delivery: { label: "Delivery (iFood / em breve WhatsApp)", icon: <Bike className="h-3.5 w-3.5" /> },
  retirada: { label: "Retirada na loja", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
};

export function StoresSection() {
  return (
    <section className="bg-brand-cream py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <p className="font-script text-3xl" style={{ color: "#e8231f" }}>lojas</p>
          <h2 className="mt-1 font-display text-4xl md:text-5xl" style={{ color: "#2a1810" }}>
            Encontre uma Parmê mais próxima de você
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {STORES.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.08}>
              <div className="flex gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: "#e8231f" }}>
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl" style={{ color: "#2a1810" }}>{s.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">{s.address}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.services.map((svc) => {
                      const info = serviceLabels[svc];
                      if (!info) return null;
                      return (
                        <span
                          key={svc}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={
                            info.highlighted
                              ? { background: "#e8231f", color: "#fff" }
                              : { background: "rgba(232,35,31,0.1)", color: "#e8231f" }
                          }
                        >
                          {info.icon}
                          {info.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
