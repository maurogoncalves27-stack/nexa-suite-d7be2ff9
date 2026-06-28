import { Star } from "lucide-react";
import { Reveal } from "./reveal";

const REVIEWS = [
  { name: "Karina Nathallya", text: "Muito boa a comida, bastante saborosa." },
  { name: "Lupita", text: "Experiência maravilhosa, retirei na loja e cheguei em casa quase 1h depois e ainda estava quentinho e saboroso… Perfeito! Parabéns." },
  { name: "Alderir Amaral", text: "O melhor de Brasília. Recomendo!" },
];

export function ReviewsSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <p className="font-script text-3xl" style={{ color: "#e8231f" }}>o que os fominhas dizem</p>
          <h2 className="mt-1 font-display text-4xl md:text-5xl" style={{ color: "#2a1810" }}>Avaliações do Google</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {REVIEWS.map((r, i) => (
            <Reveal key={r.name} delay={i * 0.08}>
              <article className="flex h-full flex-col rounded-2xl bg-white p-6 shadow ring-1 ring-black/10">
                <div className="flex gap-0.5" style={{ color: "#e8b339" }}>
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-700">"{r.text}"</p>
                <p className="mt-4 font-display text-base" style={{ color: "#2a1810" }}>{r.name}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
