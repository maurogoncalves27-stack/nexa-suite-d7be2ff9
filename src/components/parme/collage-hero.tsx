import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { MessageCircle, CalendarDays } from "lucide-react";
import type { BrandTheme } from "./brand-theme";
import { WHATSAPP_URL } from "@/lib/cta";

export function CollageHero({ theme }: { theme: BrandTheme }) {
  const tiles = theme.collage.slice(0, 5);
  return (
    <section className="relative isolate overflow-hidden bg-black">
      <div className="absolute inset-0 grid grid-cols-3 gap-1 opacity-90">
        {[tiles[0], tiles[1], tiles[2]].map((src, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: i * 0.08 }}
            className="relative h-full"
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </motion.div>
        ))}
      </div>
      <div className="absolute inset-0 bg-black/35" />

      <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center px-5 py-20 text-center md:min-h-[88vh] md:px-6 md:py-28">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.02] drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
          style={{ color: theme.bgText }}
        >
          {theme.heroTitle[0]}
          <br />
          {theme.heroTitle[1]}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="!hidden items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 font-bold uppercase tracking-wide text-white shadow-lg transition hover:-translate-y-0.5"
          >
            <MessageCircle className="h-5 w-5" /> Peça pelo WhatsApp
          </a>
          <Link
            to="/parme/reservar"
            className="inline-flex items-center gap-2 rounded-full border-2 px-7 py-3.5 font-bold uppercase tracking-wide transition hover:bg-white/10"
            style={{ borderColor: theme.bgText, color: theme.bgText }}
          >
            <CalendarDays className="h-5 w-5" /> Faça sua reserva
          </Link>
          <a
            href="#cardapio"
            className="rounded-full px-7 py-3.5 font-bold uppercase tracking-wide transition hover:opacity-90"
            style={{ background: theme.primary, color: theme.primaryText }}
          >
            Ver cardápio
          </a>
        </motion.div>
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-2 gap-1 px-1 pb-1 md:grid-cols-2">
        {[tiles[3], tiles[4]].map((src, i) => (
          <motion.img
            key={i}
            src={src}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
            className="h-28 w-full object-cover sm:h-40 md:h-56"
          />
        ))}
      </div>
    </section>
  );
}
