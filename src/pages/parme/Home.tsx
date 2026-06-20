import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { parmeAssets } from "@/assets/parme-assets";
import { ReviewsSection } from "@/components/parme/reviews-section";

type Card = {
  title: string;
  to: string;
  dish: string;
  stamp1: string;
  stamp2: string;
  cardBg: string;
  titleColor: string;
};

const CARDS: Card[] = [
  { title: "Aquela Parmê", to: "/parme/aquela-parme", dish: parmeAssets.IMG_dobra_01_parme, stamp1: parmeAssets.Circulo_fundo_parme_1, stamp2: parmeAssets.Circulo_fundo_parme_2, cardBg: "#7a0c0c", titleColor: "#fff7e6" },
  { title: "Box Caipira", to: "/parme/box-caipira", dish: parmeAssets.IMG_dobra_01_box, stamp1: parmeAssets.Circulo_fundo_box1, stamp2: parmeAssets.Circulo_fundo_box_2, cardBg: "#f39264", titleColor: "#fff7e6" },
  { title: "Aquele Estrogonofe", to: "/parme/aquele-estrogonofe", dish: parmeAssets.IMG_dobra_01_estrogonofe, stamp1: parmeAssets.Circulo_fundo_estrogonofe_1, stamp2: parmeAssets.Circulo_fundo_estrogonofe_2, cardBg: "#bba07a", titleColor: "#fff7e6" },
];

function Sparkle({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <svg className={`pointer-events-none absolute ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="#fff7e6" aria-hidden>
      <path d="M12 0 L13.8 10.2 L24 12 L13.8 13.8 L12 24 L10.2 13.8 L0 12 L10.2 10.2 Z" />
    </svg>
  );
}

function BrandCard({ card, index }: { card: Card; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-[24px] aspect-[4/4.6] sm:aspect-[3/4.2] md:rounded-[28px]"
      style={{ background: card.cardBg }}
    >
      <Link to={card.to} className="absolute inset-0 z-30" aria-label={card.title} />
      <h2 className="relative z-10 mt-8 px-6 text-center font-display text-[clamp(1.75rem,6vw,3.25rem)] leading-[1.02] md:mt-10 md:px-8" style={{ color: card.titleColor }}>
        {card.title}
      </h2>

      <Sparkle className="left-6 top-[42%]" size={22} />
      <Sparkle className="right-8 top-[38%]" size={28} />
      <Sparkle className="left-10 bottom-[26%]" size={18} />
      <Sparkle className="right-6 bottom-[34%]" size={24} />
      <Sparkle className="left-[42%] top-[35%]" size={14} />

      <div className="relative z-10 mt-auto flex flex-1 items-center justify-center px-4">
        <img
          src={card.dish}
          alt={`Prato em destaque de ${card.title}`}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
          width={720}
          height={720}
          className="relative z-10 h-full w-full max-h-[360px] object-contain drop-shadow-[0_18px_22px_rgba(0,0,0,0.25)] transition-transform duration-700 group-hover:scale-105"
        />
        <img src={card.stamp1} alt="" aria-hidden loading="lazy" decoding="async" className="absolute left-2 top-2 z-20 w-[28%] -rotate-12 object-contain drop-shadow-md" />
        <img src={card.stamp2} alt="" aria-hidden loading="lazy" decoding="async" className="absolute bottom-2 right-2 z-20 w-[26%] rotate-6 object-contain drop-shadow-md" />
      </div>

      <div className="relative z-10 mb-6 flex pl-6 md:mb-8 md:pl-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-cream px-6 py-3 text-sm font-bold text-brand-ink shadow-md transition group-hover:-translate-y-0.5">
          Saiba mais
          <span className="grid h-5 w-5 place-items-center rounded-full border border-current">
            <ChevronRight className="h-3 w-3" />
          </span>
        </span>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  useEffect(() => {
    document.title = "Aquela Parmê — Comida com gosto de casa em Brasília";
  }, []);

  return (
    <SiteLayout>
      <section className="bg-brand-cream">
        <div className="mx-auto grid max-w-[1320px] gap-4 px-4 py-6 md:grid-cols-3 md:gap-6 md:px-6 md:py-8">
          {CARDS.map((c, i) => (
            <BrandCard key={c.to} card={c} index={i} />
          ))}
        </div>
      </section>

      <ReviewsSection />
    </SiteLayout>
  );
}
