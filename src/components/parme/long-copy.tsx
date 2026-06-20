import { motion } from "framer-motion";
import { parmeAssets } from "@/assets/parme-assets";
import type { BrandTheme } from "./brand-theme";

export function LongCopyBlock({ theme }: { theme: BrandTheme }) {
  return (
    <section
      className="relative overflow-hidden py-16 md:py-24"
      style={{ background: theme.bg, color: theme.bgText }}
    >
      <img
        src={parmeAssets.Star_bg}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15 mix-blend-screen"
      />
      <div className="relative z-10 mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-10 md:px-6">
        <div>
          <p className="font-script text-3xl opacity-90" style={{ color: theme.bgText }}>
            {theme.scriptTagline}
          </p>
          <h3 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            {theme.bigTitle[0]}
            <br />
            {theme.bigTitle[1]}
          </h3>
        </div>
        <div className="space-y-4 text-base leading-relaxed md:space-y-5 md:text-lg">
          {theme.longCopy.map((p, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              {p}
            </motion.p>
          ))}
        </div>
      </div>
    </section>
  );
}
