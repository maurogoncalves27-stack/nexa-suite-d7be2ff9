import { useEffect } from "react";
import { motion } from "framer-motion";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { parmeAssets } from "@/assets/parme-assets";
import { Reveal } from "@/components/parme/reveal";
import { InstagramStrip } from "@/components/parme/instagram-strip";

const PILARES = [
  { titulo: "Comida de verdade", texto: "Ingrediente bom, preparo sem pressa e porção que satisfaz." },
  { titulo: "Receita honesta", texto: "Sem firula. O sabor fala mais alto que qualquer enfeite no prato." },
  { titulo: "Atendimento na régua", texto: "Pedido entregue quente, do jeitinho que saiu da cozinha." },
];

export default function SobrePage() {
  useEffect(() => {
    document.title = "Sobre — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      <section className="relative isolate overflow-hidden bg-black">
        <img src={parmeAssets.parmegiana_familia} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="relative z-10 mx-auto max-w-5xl px-5 py-24 text-center text-brand-cream md:px-6 md:py-32">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }} className="font-script text-3xl" style={{ color: "#ef6b3a" }}>
            a nossa história
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.02]">
            Três marcas,
            <br />
            uma só fome.
          </motion.h1>
        </div>
      </section>

      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:gap-12 md:px-6 md:grid-cols-2 md:items-center">
          <Reveal>
            <img src={parmeAssets.IMG_dobra_01_parme} alt="Parmegiana" className="aspect-square w-full rounded-3xl object-cover shadow-2xl" />
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="font-display text-4xl md:text-5xl" style={{ color: "#7a0c0c" }}>Começou na cozinha de casa</h2>
            <div className="mt-5 space-y-4 text-lg" style={{ color: "rgba(0,0,0,0.7)" }}>
              <p>A Aquela Parmê nasceu da vontade de servir parmegiana do jeito que a gente gosta de comer: molho de tomate apurado, filé alto, queijo derretido sem economia.</p>
              <p>Em pouco tempo virou referência em Brasília e abriu espaço pra duas irmãs: Box Caipira, com comida de fogão de lenha, e Aquele Estrogonofe, cremoso na medida certa.</p>
              <p>São três cardápios diferentes, mas a mesma obsessão por comida bem feita.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 md:py-24" style={{ background: "#fff1d6" }}>
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          <Reveal>
            <p className="font-script text-3xl" style={{ color: "#e8231f" }}>o que move a casa</p>
            <h2 className="mt-1 font-display text-4xl md:text-5xl" style={{ color: "#7a0c0c" }}>Nossos pilares</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PILARES.map((p, i) => (
              <Reveal key={p.titulo} delay={i * 0.1}>
                <article className="h-full rounded-3xl bg-white p-8 shadow-md ring-1 ring-black/5">
                  <h3 className="font-display text-2xl" style={{ color: "#e8231f" }}>{p.titulo}</h3>
                  <p className="mt-3" style={{ color: "rgba(0,0,0,0.7)" }}>{p.texto}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 text-center md:px-6">
          <Reveal>
            <h2 className="font-display text-4xl md:text-5xl" style={{ color: "#7a0c0c" }}>As três marcas</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { logo: parmeAssets.Logo_Aquela_Parme, bg: "#e8231f" },
              { logo: parmeAssets.Logo_Box_Caipira, bg: "#ef6b3a" },
              { logo: parmeAssets.Logo_Aquele_estrogonofe, bg: "#bba07a" },
            ].map((b, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="flex aspect-square items-center justify-center rounded-3xl p-10 shadow-lg" style={{ background: b.bg }}>
                  <img src={b.logo} alt="" className="max-h-40 w-auto" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <InstagramStrip handle="aquelaparme" color="#e8231f" />
    </SiteLayout>
  );
}
