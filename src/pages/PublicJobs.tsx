import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Briefcase, ArrowRight } from "lucide-react";
import "@/styles/aquelaparme.css";
import { useBrandFavicon } from "@/hooks/useBrandFavicon";
import { ApFloatingHeader, ApFooter } from "@/components/public/AquelaParmeChrome";

const AP_FAVICON = "https://aquelaparme.com.br/wp-content/uploads/2026/01/cropped-Icon-Aquela-parme-1-192x192.webp";

interface PublicJob {
  id: string;
  title: string;
  position: string;
  store_id: string | null;
  description: string | null;
  public_image_url: string | null;
  positions_count: number;
  salary_min: number | null;
  salary_max: number | null;
}

export default function PublicJobs() {
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [stores, setStores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useBrandFavicon(AP_FAVICON);

  useEffect(() => {
    document.title = "Trabalhe na Aquela Parmê — Vagas abertas";
    (async () => {
      const [{ data: js }, { data: sto }] = await Promise.all([
        supabase.from("job_openings")
          .select("id, title, position, store_id, description, public_image_url, positions_count, salary_min, salary_max")
          .eq("is_public", true).eq("status", "open")
          .order("opened_at", { ascending: false }),
        supabase.from("stores").select("id, name"),
      ]);
      setJobs((js ?? []) as PublicJob[]);
      setStores(Object.fromEntries((sto ?? []).map((s: any) => [s.id, s.name])));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="ap-brand min-h-screen">
      <ApFloatingHeader />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-12 pb-8 md:pt-20 md:pb-12 text-center">
        <span className="ap-tag mb-4">★ Estamos contratando</span>
        <h1 className="ap-display text-4xl md:text-6xl mt-4 leading-tight">
          Venha fazer parte<br className="hidden md:block" /> da Aquela Parmê
        </h1>
        <p className="ap-sans text-base md:text-lg mt-5 max-w-2xl mx-auto" style={{ color: "hsl(var(--ap-brown))" }}>
          Processo simples e transparente. Confira as vagas abertas e candidate-se em poucos minutos.
        </p>
      </section>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ap-red))" }} /></div>
        ) : jobs.length === 0 ? (
          <div className="ap-card py-16 text-center">
            <p className="ap-sans" style={{ color: "hsl(var(--ap-brown))" }}>
              No momento não temos vagas abertas — volte em breve!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {jobs.map((j) => (
              <Link key={j.id} to={`/vagas/${j.id}`} className="group block">
                <article className="ap-card h-full transition-all hover:-translate-y-1 hover:shadow-xl">
                  {j.public_image_url ? (
                    <div className="aspect-[16/9] overflow-hidden" style={{ background: "hsl(var(--ap-orange) / .15)" }}>
                      <img src={j.public_image_url} alt={j.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] flex items-center justify-center" style={{ background: "hsl(var(--ap-orange) / .25)" }}>
                      <Briefcase className="h-16 w-16" style={{ color: "hsl(var(--ap-red) / .5)" }} />
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div>
                      <h3 className="ap-display text-2xl leading-tight">{j.title}</h3>
                      <p className="ap-sans text-sm mt-1" style={{ color: "hsl(var(--ap-brown))" }}>{j.position}</p>
                    </div>
                    {j.description && (
                      <p className="ap-sans text-sm line-clamp-2" style={{ color: "hsl(var(--ap-ink) / .8)" }}>{j.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {j.store_id && stores[j.store_id] && (
                        <span className="ap-tag ap-tag-soft"><MapPin className="h-3 w-3" />{stores[j.store_id]}</span>
                      )}
                      <span className="ap-tag ap-tag-soft">{j.positions_count} {j.positions_count === 1 ? "vaga" : "vagas"}</span>
                      {j.salary_min && (
                        <span className="ap-tag ap-tag-soft">
                          R$ {j.salary_min.toLocaleString("pt-BR")}
                          {j.salary_max ? ` – ${j.salary_max.toLocaleString("pt-BR")}` : "+"}
                        </span>
                      )}
                    </div>
                    <div className="ap-sans flex items-center font-semibold text-sm pt-3 group-hover:gap-3 gap-2 transition-all" style={{ color: "hsl(var(--ap-red))" }}>
                      Ver vaga e candidatar-se <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>

      <ApFooter />
    </div>
  );
}
