import { useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, ExternalLink, Clock, UtensilsCrossed, ShoppingBag, Bike, Phone } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { STORES } from "@/components/parme/stores";

const serviceLabels: Record<string, { label: string; icon: React.ReactNode; highlighted?: boolean }> = {
  mesa: { label: "Atendimento de mesa", icon: <UtensilsCrossed className="h-3.5 w-3.5" />, highlighted: true },
  delivery: { label: "Delivery iFood / WhatsApp em breve", icon: <Bike className="h-3.5 w-3.5" /> },
  retirada: { label: "Retirada na loja", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
};

export default function EnderecosPage() {
  useEffect(() => {
    document.title = "Endereços das lojas — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      <section className="bg-brand-cream pb-20 pt-28 md:pt-32">
        <div className="mx-auto max-w-5xl px-4">
          <p className="font-script text-3xl" style={{ color: "#e8231f" }}>onde estamos</p>
          <h1 className="mt-1 font-display text-4xl md:text-6xl" style={{ color: "#2a1810" }}>Nossos endereços</h1>
          <p className="mt-4 max-w-2xl text-base md:text-lg" style={{ color: "rgba(0,0,0,0.65)" }}>
            Quatro unidades em Brasília prontas para receber você. Escolha a mais próxima e venha matar a saudade do parmegiana.
          </p>

          <div className="mt-8 inline-flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-sm" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
            <Clock className="h-4 w-4" style={{ color: "#e8231f" }} aria-hidden />
            <span className="font-medium" style={{ color: "#2a1810" }}>Todos os dias 11h – 22h</span>
            <span className="hidden sm:inline" style={{ color: "rgba(0,0,0,0.5)" }}>·</span>
            <span style={{ color: "rgba(0,0,0,0.65)" }}>inclusive feriados</span>
          </div>

          <div className="mt-10 grid gap-5">
            {STORES.map((s) => {
              const query = encodeURIComponent(`Aquela Parmê ${s.name}, ${s.address}`);
              const embed = `https://www.google.com/maps?q=${query}&output=embed`;
              const link = `https://www.google.com/maps/search/?api=1&query=${query}`;
              return (
                <article key={s.name} className="overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
                  <div className="flex flex-col md:flex-row">
                    <div className="h-40 w-full shrink-0 bg-gray-100 md:h-auto md:w-64 lg:w-72">
                      <iframe title={`Mapa Aquela Parmê ${s.name}`} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-full w-full border-0" />
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-5 md:p-6">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-display text-2xl md:text-3xl" style={{ color: "#2a1810" }}>Aquela Parmê — {s.name}</h2>
                            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "rgba(0,0,0,0.65)" }}>{s.address}</p>
                          </div>
                          <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: "#e8231f" }}>
                            <MapPin className="h-5 w-5" aria-hidden />
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {s.services.map((svc) => {
                            const info = serviceLabels[svc];
                            if (!info) return null;
                            return (
                              <span key={svc} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(232,35,31,0.1)", color: "#e8231f" }}>
                                {info.icon}
                                {info.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-4">
                        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: "#e8231f" }}>
                          Ver no Google Maps
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                        {s.services.includes("mesa") && (
                          <Link to="/parme/reservar" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: "#e8231f" }}>
                            Reservar mesa
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-12">
            <Link to="/parme" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline" style={{ color: "#e8231f" }}>
              ← Voltar para a home
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
