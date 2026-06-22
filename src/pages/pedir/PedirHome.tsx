// Seletor de loja para retirada.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PedirLayout } from "./PedirLayout";

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
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black tracking-tight">Peça e retire</h1>
        <p className="mt-1 text-sm opacity-70">
          Parmê · Estrogonofe · Box Caipira — tudo em um pedido só
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold opacity-70">Escolha a loja</h2>
        {loading && <div className="text-sm opacity-60">Carregando lojas…</div>}
        {!loading &&
          stores.map((s) => (
            <Link
              key={s.id}
              to={`/pedir/${s.slug}`}
              className="block rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md"
              style={{ borderColor: "hsl(var(--brand-accent) / 0.2)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-bold">{s.display_name}</div>
                  {s.address && (
                    <div className="mt-1 flex items-start gap-1 text-xs opacity-70">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{s.address}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
                    <Clock className="h-3 w-3" />
                    Retirada em ~{s.min_pickup_minutes} min
                  </div>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (s.is_open ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600")
                  }
                >
                  {s.is_open ? "Aberta" : "Fechada"}
                </span>
              </div>
            </Link>
          ))}
        {!loading && stores.length === 0 && (
          <div className="rounded-2xl border bg-white p-6 text-center text-sm opacity-70">
            Nenhuma loja disponível no momento.
          </div>
        )}
      </div>
    </PedirLayout>
  );
}
