import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Dish } from "./dish-grid";

export function DishCarousel({ dishes, accent = "#e8231f" }: { dishes: Dish[]; accent?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.7), behavior: "smooth" });
  };
  return (
    <div className="relative">
      <div
        ref={ref}
        className="hide-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-6 pb-6"
        style={{ scrollbarWidth: "none" }}
      >
        {dishes.map((d, i) => (
          <motion.figure
            key={d.name + i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: (i % 4) * 0.05 }}
            className="relative shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5"
            style={{ width: "min(78vw, 360px)" }}
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={d.img}
                alt={d.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
              />
            </div>
            <figcaption
              className="px-4 py-3 text-center font-display text-lg"
              style={{ background: accent, color: "#fff7e6" }}
            >
              {d.name}
            </figcaption>
          </motion.figure>
        ))}
      </div>

      <button
        onClick={() => scroll(-1)}
        aria-label="Anterior"
        className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white p-3 shadow-lg ring-1 ring-black/10 hover:bg-white/95 md:block"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => scroll(1)}
        aria-label="Próximo"
        className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white p-3 shadow-lg ring-1 ring-black/10 hover:bg-white/95 md:block"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
