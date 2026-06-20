import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  MapPin, ExternalLink, Clock, UtensilsCrossed, ShoppingBag, Truck, Phone,
} from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { STORES } from "@/components/parme-site/brand-theme";

const serviceLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  mesa: { label: "Atendimento de mesa", icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
  delivery: { label: "Delivery iFood / WhatsApp em breve", icon: <Truck className="h-3.5 w-3.5" /> },
  retirada: { label: "Retirada na loja", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
};

export default function ParmeEnderecos() {
  useEffect(() => {
    document.title = "Endereços das lojas — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      <section className="bg-brand-cream pb-20 pt-28 md:pt-32">
        <div className="mx-auto max-w-5xl px-4">
          <p className="font-script text-3xl text-brand-red">onde estamos</p>
          <h1 className="mt-1 font-display text-4xl text-brand-red-dark md:text-6xl">
            Nossos endereços
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600 md:text-lg">
            Quatro unidades em Brasília prontas para receber você. Escolha a mais próxima
            e venha matar a saudade do parmegiana.
          </p>

          <div className="mt-8 inline-flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--parme-border))] bg-white px-4 py-3 text-sm shadow-sm">
            <Clock className="h-4 w-4 text-brand-red" />
            <span className="font-medium text-brand-ink">Todos os dias 11h – 22h</span>
            <span className="hidden text-gray-500 sm:inline">·</span>
            <span className="text-gray-500">inclusive feriados</span>
          </div>

          <div className="mt-10 grid gap-5">
            {STORES.map((s) => {
              const query = encodeURIComponent(`Aquela Parmê ${s.name}, ${s.address}`);
              const embed = `https://www.google.com/maps?q=${query}&output=embed`;
              const link = `https://www.google.com/maps/search/?api=1&query=${query}`;
              return (
                <article
                  key={s.name}
                  className="overflow-hidden rounded-2xl border border-[hsl(var(--parme-border))] bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="flex flex-col md:flex-row">
                    <div className="h-40 w-full shrink-0 bg-gray-100 md:h-auto md:w-64 lg:w-72">
                      <iframe
                        title={`Mapa Aquela Parmê ${s.name}`}
                        src={embed}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        className="h-full w-full border-0"
                      />
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-5 md:p-6">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-display text-2xl text-brand-ink md:text-3xl">
                              Aquela Parmê — {s.name}
                            </h2>
                            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                              {s.address}
                            </p>
                          </div>
                          <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-red text-white">
                            <MapPin className="h-5 w-5" />
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {s.services.map((svc) => {
                            const info = serviceLabels[svc];
                            if (!info) return null;
                            return (
                              <span
                                key={svc}
                                className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 px-3 py-1.5 text-xs font-medium text-brand-red"
                              >
                                {info.icon}
                                {info.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-4">
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red hover:underline"
                        >
                          Ver no Google Maps
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {s.services.includes("mesa" as never) && (
                          <Link
                            to="/parme/reservar"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red hover:underline"
                          >
                            Reservar mesa
                            <Phone className="h-3.5 w-3.5" />
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
            <Link
              to="/parme"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-red hover:underline"
            >
              ← Voltar para a home
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
