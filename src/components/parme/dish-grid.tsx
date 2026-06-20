import { motion } from "framer-motion";

export type Dish = { name: string; img: string };

export function DishGrid({ dishes }: { dishes: Dish[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
      {dishes.map((d, i) => (
        <motion.figure
          key={d.name}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, delay: (i % 6) * 0.06, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -6 }}
          className="group overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-black/10"
        >
          <div className="aspect-square overflow-hidden">
            <img
              src={d.img}
              alt={d.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          </div>
          <figcaption className="px-4 py-3 text-center font-display text-base md:text-lg" style={{ color: "#2a1810" }}>
            {d.name}
          </figcaption>
        </motion.figure>
      ))}
    </div>
  );
}
