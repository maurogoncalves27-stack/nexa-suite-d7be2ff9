import { useEffect } from "react";
import { motion } from "framer-motion";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { Reveal } from "@/components/parme/reveal";
import { Gift, Star, MapPin } from "lucide-react";

export default function SurpresaPage() {
  useEffect(() => {
    document.title = "Surpresa — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-black">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(1200px 600px at 20% 20%, #e8231f 0%, transparent 60%), radial-gradient(900px 500px at 80% 80%, #ef6b3a 0%, transparent 55%), #1a0808",
          }}
        />
        <div className="relative z-10 mx-auto max-w-5xl px-5 py-20 text-center text-brand-cream md:px-6 md:py-28">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="font-script text-3xl"
            style={{ color: "#ffd66b" }}
          >
            uma surpresinha pra você
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 font-display text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.02]"
          >
            Avaliou a Parmê?
            <br />
            Ganhou churros. 🍩
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="mx-auto mt-5 max-w-2xl text-base md:text-lg text-brand-cream/85"
          >
            Como agradecimento pela sua avaliação, a gente te entrega uma porção
            de churros quentinha na nossa loja física da Asa Norte. Sem pegadinha.
          </motion.p>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          <Reveal>
            <p className="font-script text-3xl" style={{ color: "#e8231f" }}>
              como funciona
            </p>
            <h2
              className="mt-1 font-display text-4xl md:text-5xl"
              style={{ color: "#7a0c0c" }}
            >
              Três passos e o churros é seu
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Star,
                titulo: "1. Avalie a gente",
                texto:
                  "Deixe sua avaliação honesta no Google sobre a Aquela Parmê.",
              },
              {
                icon: Gift,
                titulo: "2. Mostre na loja",
                texto:
                  "Apresente a avaliação no caixa da nossa loja física da Asa Norte.",
              },
              {
                icon: MapPin,
                titulo: "3. Receba o churros",
                texto:
                  "A gente prepara uma porção fresquinha pra você saborear na hora.",
              },
            ].map((p, i) => (
              <Reveal key={p.titulo} delay={i * 0.1}>
                <article className="h-full rounded-3xl bg-white p-8 shadow-md ring-1 ring-black/5">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: "#fff1d6" }}
                  >
                    <p.icon className="h-6 w-6" style={{ color: "#e8231f" }} />
                  </div>
                  <h3
                    className="mt-5 font-display text-2xl"
                    style={{ color: "#e8231f" }}
                  >
                    {p.titulo}
                  </h3>
                  <p className="mt-3" style={{ color: "rgba(0,0,0,0.7)" }}>
                    {p.texto}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ONDE RESGATAR */}
      <section className="py-16 md:py-24" style={{ background: "#fff1d6" }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:px-6 md:grid-cols-2 md:items-center">
          <Reveal>
            <p className="font-script text-3xl" style={{ color: "#ef6b3a" }}>
              onde resgatar
            </p>
            <h2
              className="mt-1 font-display text-4xl md:text-5xl"
              style={{ color: "#7a0c0c" }}
            >
              Aquela Parmê — Asa Norte
            </h2>
            <p className="mt-5 text-lg" style={{ color: "rgba(0,0,0,0.7)" }}>
              Passe na nossa loja física da Asa Norte, mostre sua avaliação pro
              atendente e leve o churros. Válido enquanto durarem as porções do
              dia, um por cliente.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-black/5">
              <h3
                className="font-display text-2xl"
                style={{ color: "#7a0c0c" }}
              >
                Regrinhas básicas
              </h3>
              <ul
                className="mt-4 space-y-3 text-base"
                style={{ color: "rgba(0,0,0,0.75)" }}
              >
                <li>• 1 porção de churros por cliente.</li>
                <li>• Resgate presencial na loja da Asa Norte.</li>
                <li>• Necessário mostrar a avaliação publicada.</li>
                <li>• Não é cumulativo com outras promoções.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
}
