import { motion } from "framer-motion";
import type { BrandTheme } from "./brand-theme";

export function BigTitleSection({ theme }: { theme: BrandTheme }) {
  const tiles = theme.collage.slice(0, 4);
  return (
    <section className="relative overflow-hidden bg-brand-cream py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 text-center md:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[1.02]"
          style={{ color: theme.accent }}
        >
          {theme.bigTitle[0]}
          <br />
          {theme.bigTitle[1]}
        </motion.h2>
      </div>

      <div className="relative mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-2 px-3 sm:grid-cols-4 md:mt-12">
        {tiles.map((src, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30, rotate: -2 + i }}
            whileInView={{ opacity: 1, y: 0, rotate: -3 + i * 1.5 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="origin-bottom"
          >
            <img
              src={src}
              alt=""
              className="aspect-[3/4] w-full rounded-md object-cover shadow-xl ring-1 ring-black/10"
            />
          </motion.div>
        ))}
      </div>

      <img
        src={theme.logo}
        alt=""
        aria-hidden
        className="pointer-events-none mx-auto mt-[-40px] block h-24 w-auto opacity-90 sm:mt-[-80px] md:h-40"
      />
    </section>
  );
}
