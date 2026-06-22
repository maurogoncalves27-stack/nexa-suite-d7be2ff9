// Seletor de loja para retirada — visual Aquela Parmê.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PedirLayout } from "./PedirLayout";
import { parmeAssets } from "@/assets/parme-assets";

type Store = {
  id: string;
  slug: string;
  display_name: string;
  address: string | null;
  is_open: boolean;
  min_pickup_minutes: number;
};

export default function PedirHome() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("ecommerce_stores")
        .select("id, slug, display_name, address, is_open, min_pickup_minutes")
        .eq("active", true)
        .order("display_name");
      if (!error && data) setStores(data as Store[]);
      setLoading(false);
    })();
  }, []);

  return (
    <PedirLayout>
      {/* Hero */}
      <section className="text-center">
        <h1 className="ap-display mt-4" style={{ fontSize: "clamp(2.25rem, 7vw, 3.75rem)" }}>
          Peça <em className="not-italic" style={{ color: "hsl(var(--ap-mustard))" }}>online</em>
          <br />
          retire no balcão
        </h1>
        <p
          className="mx-auto mt-3 max-w-md text-base"
          style={{ color: "hsl(var(--ap-brown-2))", fontFamily: "Bitter, serif" }}
        >
          Parmê, Estrogonofe e Box Caipira — tudo num pedido só.
        </p>

        {/* Logos das 3 marcas */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {[
            { src: parmeAssets.Logo_Aquela_Parme, bg: "#c93029", alt: "Aquela Parmê" },
            { src: parmeAssets.Logo_Aquele_estrogonofe, bg: "#bba07a", alt: "Aquele Estrogonofe" },
            { src: parmeAssets.Logo_Box_Caipira, bg: "#ef6b3a", alt: "Box Caipira" },
          ].map((b) => (
            <div
              key={b.alt}
              className="grid h-16 w-16 place-items-center rounded-full p-2 shadow-md md:h-20 md:w-20"
              style={{ background: b.bg }}
            >
              <img src={b.src} alt={b.alt} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </div>
      </section>

      {/* Lojas */}
      <section className="mt-10">
        <h2
          className="ap-display text-center"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}
        >
          Escolha sua loja
        </h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {loading && (
            <div className="col-span-full text-center text-sm opacity-60">
              Carregando lojas…
            </div>
          )}

          {!loading &&
            stores.map((s) => (
              <Link
                key={s.id}
                to={`/pedir/${s.slug}`}
                className="ap-card group block p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="ap-display text-xl"
                      style={{ fontSize: "1.5rem", lineHeight: 1.1 }}
                    >
                      {s.display_name}
                    </div>
                    {s.address && (
                      <div
                        className="mt-2 flex items-start gap-1.5 text-sm"
                        style={{ color: "hsl(var(--ap-brown-2))" }}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="leading-snug">{s.address}</span>
                      </div>
                    )}
                    <div
                      className="mt-1.5 flex items-center gap-1.5 text-sm"
                      style={{ color: "hsl(var(--ap-brown-2))" }}
                    >
                      <Clock className="h-4 w-4" />
                      Pronto em ~{s.min_pickup_minutes} min
                    </div>
                  </div>

                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                    style={
                      s.is_open
                        ? { background: "hsl(var(--ap-mustard) / .25)", color: "hsl(var(--ap-red))" }
                        : { background: "hsl(var(--ap-brown) / .12)", color: "hsl(var(--ap-brown-2))" }
                    }
                  >
                    {s.is_open ? "Aberta" : "Fechada"}
                  </span>
                </div>

                <div
                  className="mt-4 flex items-center justify-end gap-1 text-sm font-semibold transition group-hover:gap-2"
                  style={{ color: "hsl(var(--ap-red))" }}
                >
                  Ver cardápio
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            ))}

          {!loading && stores.length === 0 && (
            <div className="ap-card col-span-full p-6 text-center text-sm opacity-70">
              Nenhuma loja disponível no momento.
            </div>
          )}
        </div>
      </section>
    </PedirLayout>
  );
}
