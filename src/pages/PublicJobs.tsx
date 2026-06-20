import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Briefcase, ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { Reveal } from "@/components/parme/reveal";

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

  useEffect(() => {
    document.title = "Junte-se a nós — Aquela Parmê";
    (async () => {
      const [{ data: js }, { data: sto }] = await Promise.all([
        supabase
          .from("job_openings")
          .select("id, title, position, store_id, description, public_image_url, positions_count, salary_min, salary_max")
          .eq("is_public", true)
          .eq("status", "open")
          .order("opened_at", { ascending: false }),
        supabase.from("stores").select("id, name"),
      ]);
      setJobs((js ?? []) as PublicJob[]);
      setStores(Object.fromEntries((sto ?? []).map((s: any) => [s.id, s.name])));
      setLoading(false);
    })();
  }, []);

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-5 text-center md:px-6">
          <Reveal>
            <p className="font-script text-3xl" style={{ color: "#ef6b3a" }}>
              estamos contratando
            </p>
            <h1
              className="mt-2 font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.02]"
              style={{ color: "#7a0c0c" }}
            >
              Venha fazer parte
              <br />
              da Aquela Parmê
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg" style={{ color: "rgba(0,0,0,0.7)" }}>
              Processo simples e transparente. Confira as vagas abertas e candidate-se em poucos minutos.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Lista */}
      <section className="py-16 md:py-20" style={{ background: "#fff1d6" }}>
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#e8231f" }} />
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-3xl bg-white p-16 text-center shadow-md ring-1 ring-black/5">
              <p className="text-lg" style={{ color: "rgba(0,0,0,0.7)" }}>
                No momento não temos vagas abertas — volte em breve!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {jobs.map((j, i) => {
                const bannerHtml = `<div class="relative flex aspect-[16/9] items-center justify-center overflow-hidden" style="background: linear-gradient(135deg, #e8231f 0%, #ef6b3a 60%, #f4a261 100%);"><div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 40%);"></div><div class="relative z-10 flex flex-col items-center gap-2 px-6 text-center"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><span class="font-display text-xl leading-tight text-white drop-shadow-md md:text-2xl">${j.title.replace(/</g,'&lt;')}</span></div></div>`;
                return (
                <Reveal key={j.id} delay={i * 0.05}>
                  <Link to={`/vagas/${j.id}`} className="group block h-full">
                    <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-xl">
                      {j.public_image_url ? (
                        <div className="aspect-[16/9] overflow-hidden" style={{ background: "rgba(239,107,58,0.15)" }}>
                          <img
                            src={j.public_image_url}
                            alt={j.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              const img = e.currentTarget;
                              const parent = img.parentElement;
                              if (parent) parent.outerHTML = bannerHtml;
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="relative flex aspect-[16/9] items-center justify-center overflow-hidden"
                          style={{ background: "linear-gradient(135deg, #e8231f 0%, #ef6b3a 60%, #f4a261 100%)" }}
                        >
                          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 40%)" }} />
                          <div className="relative z-10 flex flex-col items-center gap-2 px-6 text-center">
                            <Briefcase className="h-10 w-10 text-white/95" />
                            <span className="font-display text-xl leading-tight text-white drop-shadow-md md:text-2xl">{j.title}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-3 p-6">
                        <div>
                          <h3 className="font-display text-2xl leading-tight" style={{ color: "#7a0c0c" }}>
                            {j.title}
                          </h3>
                          <p className="mt-1 text-sm" style={{ color: "rgba(0,0,0,0.6)" }}>
                            {j.position}
                          </p>
                        </div>
                        {j.description && (
                          <p className="line-clamp-2 text-sm" style={{ color: "rgba(0,0,0,0.7)" }}>
                            {j.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {j.store_id && stores[j.store_id] && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                              style={{ background: "rgba(232,35,31,0.1)", color: "#7a0c0c" }}
                            >
                              <MapPin className="h-3 w-3" />
                              {stores[j.store_id]}
                            </span>
                          )}
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                            style={{ background: "rgba(239,107,58,0.15)", color: "#7a0c0c" }}
                          >
                            {j.positions_count} {j.positions_count === 1 ? "vaga" : "vagas"}
                          </span>
                          {j.salary_min && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                              style={{ background: "rgba(187,160,122,0.2)", color: "#7a0c0c" }}
                            >
                              R$ {j.salary_min.toLocaleString("pt-BR")}
                              {j.salary_max ? ` – ${j.salary_max.toLocaleString("pt-BR")}` : "+"}
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-auto flex items-center gap-2 pt-3 text-sm font-semibold transition-all group-hover:gap-3"
                          style={{ color: "#e8231f" }}
                        >
                          Ver vaga e candidatar-se <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </article>
                  </Link>
                </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
