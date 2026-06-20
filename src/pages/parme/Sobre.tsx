import { useEffect } from "react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { BRAND_THEMES } from "@/components/parme-site/brand-theme";

const PILARES = [
  { titulo: "Comida de verdade", texto: "Ingrediente bom, preparo sem pressa e porção que satisfaz." },
  { titulo: "Receita honesta", texto: "Sem firula. O sabor fala mais alto que qualquer enfeite no prato." },
  { titulo: "Atendimento na régua", texto: "Pedido entregue quente, do jeitinho que saiu da cozinha." },
];

export default function ParmeSobre() {
  useEffect(() => {
    document.title = "Sobre — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      <section className="relative bg-brand-ink py-24 text-brand-cream md:py-32">
        <div className="mx-auto max-w-5xl px-5 text-center md:px-6">
          <p className="font-script text-3xl text-brand-orange">a nossa história</p>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.02]">
            Três marcas,
            <br />
            uma só fome.
          </h1>
        </div>
      </section>

      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto max-w-3xl space-y-5 px-5 text-lg leading-relaxed text-gray-700 md:px-6">
          <h2 className="font-display text-4xl text-brand-red-dark md:text-5xl">
            Começou na cozinha de casa
          </h2>
          <p>
            A Aquela Parmê nasceu da vontade de servir parmegiana do jeito que a gente
            gosta de comer: molho de tomate apurado, filé alto, queijo derretido sem
            economia.
          </p>
          <p>
            Em pouco tempo virou referência em Brasília e abriu espaço pra duas irmãs:
            Box Caipira, com comida de fogão de lenha, e Aquele Estrogonofe, cremoso na
            medida certa.
          </p>
          <p>São três cardápios diferentes, mas a mesma obsessão por comida bem feita.</p>
        </div>
      </section>

      <section style={{ background: "#fff1d6" }} className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          <p className="font-script text-3xl text-brand-red">o que move a casa</p>
          <h2 className="mt-1 font-display text-4xl text-brand-red-dark md:text-5xl">
            Nossos pilares
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PILARES.map((p) => (
              <article
                key={p.titulo}
                className="h-full rounded-3xl bg-white p-8 shadow-md ring-1 ring-black/5"
              >
                <h3 className="font-display text-2xl text-brand-red">{p.titulo}</h3>
                <p className="mt-3 text-gray-600">{p.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-cream py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 text-center md:px-6">
          <h2 className="font-display text-4xl text-brand-red-dark md:text-5xl">
            As três marcas
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {Object.values(BRAND_THEMES).map((b) => (
              <div
                key={b.key}
                className="flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl p-10 shadow-lg"
                style={{ background: b.bg }}
              >
                <span className="text-7xl">{b.emoji}</span>
                <p className="font-display text-2xl text-white">{b.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
