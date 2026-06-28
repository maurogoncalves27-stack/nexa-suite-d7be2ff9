import { motion } from "framer-motion";
import { AtSign } from "lucide-react";
import { INSTAGRAM_TILES } from "./brand-theme";

export function InstagramStrip({ handle = "aquelaparme", color = "#e8231f" }: { handle?: string; color?: string }) {
  const tiles = [...INSTAGRAM_TILES, ...INSTAGRAM_TILES];

  return (
    <section className="relative overflow-hidden" style={{ background: color, color: "#fff7e6" }}>
      <div className="mx-auto max-w-6xl px-5 py-16 text-center md:px-6 md:py-24">
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="font-display text-[clamp(2.25rem,5vw,4rem)] leading-tight"
        >
          Siga @{handle}
          <br />
          nas redes sociais
        </motion.h3>
        <a
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-current px-6 py-3 font-bold uppercase tracking-wide transition hover:bg-white/10"
        >
          <AtSign className="h-4 w-4" /> acompanha a gente
        </a>
      </div>

      <div className="relative w-full overflow-hidden">
        <motion.div
          className="flex w-max gap-2"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, ease: "linear", repeat: Infinity }}
        >
          {tiles.map((src, i) => (
            <a
              key={i}
              href={`https://instagram.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block h-[170px] w-[170px] flex-shrink-0 overflow-hidden sm:h-[240px] sm:w-[240px] md:h-[320px] md:w-[320px]"
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                style={{ background: color }}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
                <AtSign className="h-7 w-7 text-white opacity-0 transition group-hover:opacity-100" />
              </span>
            </a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
