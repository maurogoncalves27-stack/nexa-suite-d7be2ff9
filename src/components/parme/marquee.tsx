import { motion } from "framer-motion";

const tags = [
  "asanorte", "aquelaparmegiana", "aguasclaras", "parmegiana",
  "boxcaipira", "asasul", "estrogonofe", "aqueleestrogonofe", "batatafrita",
];

export function BrandMarquee() {
  const row = [...tags, ...tags, ...tags];
  return (
    <div className="overflow-hidden border-y py-4" style={{ background: "#e8231f", color: "#fff7e6", borderColor: "rgba(232,35,31,0.3)" }}>
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap font-display text-2xl uppercase tracking-wider md:text-3xl"
        animate={{ x: ["0%", "-33.333%"] }}
        transition={{ ease: "linear", duration: 28, repeat: Infinity }}
      >
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-10">
            <span>#{t}</span>
            <span aria-hidden className="opacity-50">★</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
