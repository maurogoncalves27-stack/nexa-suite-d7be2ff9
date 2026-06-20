import { motion } from "framer-motion";
import { Star, BadgeCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Review {
  name: string;
  avatar?: string | null;
  initials: string;
  timeAgo: string;
  rating: number;
  text: string;
}

interface GoogleReviewRow {
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  relative_time: string | null;
  unit_label: string;
}

const FALLBACK_REVIEWS: Review[] = [
  { name: "Karina Nathallya", initials: "KN", timeAgo: "6 meses atrás", rating: 5, text: "Muito boa a comida bastante saborosa" },
  { name: "Lupita", initials: "L", timeAgo: "6 meses atrás", rating: 5, text: "Experiência maravilhosa, retirei na loja, e cheguei em casa quase 1h depois e ainda estava quentinho e saboroso... Perfeito! Parabéns" },
  { name: "Alderir Amaral", initials: "AA", timeAgo: "6 meses atrás", rating: 5, text: "O melhor de Brasília. Recomendo!" },
];

type Unit = { label: string; place_id?: string };

const DEFAULT_UNITS: Unit[] = [
  { label: "Águas Claras" },
  { label: "Asa Sul" },
  { label: "Asa Norte" },
  { label: "Lago Sul" },
];

function reviewUrl(u: Unit) {
  if (u.place_id) {
    // Link oficial do Google que abre direto o formulário "escrever avaliação"
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(u.place_id)}`;
  }
  const q = encodeURIComponent(`Aquela Parmê ${u.label} Brasília`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function toReview(g: GoogleReviewRow): Review {
  return {
    name: g.author_name,
    avatar: g.author_photo_url,
    initials: initialsOf(g.author_name) || "?",
    timeAgo: g.relative_time ?? "",
    rating: g.rating,
    text: g.text,
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`} />
      ))}
      <BadgeCheck className="ml-1 h-4 w-4 text-blue-500" />
    </div>
  );
}

function ReviewCard({ review, index }: { review: Review; index: number }) {
  const bgColors = ["bg-[#c44569]", "bg-[#574b90]", "bg-[#8b6f5e]"];
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col rounded-2xl bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <StarRating rating={review.rating} />
        <img src="https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" alt="Google" className="h-5 w-5 object-contain opacity-80" />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-700">{review.text}</p>
      <div className="mt-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${bgColors[index % bgColors.length]}`}>
          {review.avatar ? <img src={review.avatar} alt={review.name} className="h-full w-full rounded-full object-cover" /> : review.initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{review.name}</p>
          <p className="text-xs text-gray-500">{review.timeAgo}</p>
        </div>
      </div>
    </motion.div>
  );
}

async function fetchReviews(): Promise<Review[]> {
  try {
    const { data } = await supabase.functions.invoke("parme-google-reviews", {
      body: { limit: 6 },
    });
    if (Array.isArray(data) && data.length > 0) {
      return (data as GoogleReviewRow[]).map(toReview);
    }
  } catch {
    // ignore
  }
  return FALLBACK_REVIEWS;
}

async function fetchUnits(): Promise<Unit[]> {
  try {
    const { data } = await supabase
      .from("parme_site_settings")
      .select("value")
      .eq("key", "google_places")
      .maybeSingle();
    const units = (data?.value as any)?.units as Unit[] | undefined;
    if (Array.isArray(units) && units.length > 0) {
      return units.map((u) => ({ label: u.label, place_id: u.place_id || undefined }));
    }
  } catch {
    // ignore
  }
  return DEFAULT_UNITS;
}

export function ReviewsSection() {
  const { data: reviews = FALLBACK_REVIEWS } = useQuery({
    queryKey: ["parme-google-reviews"],
    queryFn: fetchReviews,
    staleTime: 1000 * 60 * 30,
  });
  const { data: units = DEFAULT_UNITS } = useQuery({
    queryKey: ["parme-google-units"],
    queryFn: fetchUnits,
    staleTime: 1000 * 60 * 30,
  });

  return (
    <section className="bg-brand-cream py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-5 md:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center font-display text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight text-brand-ink"
        >
          O que os fominhas dizem?
        </motion.h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 6).map((r, i) => (
            <ReviewCard key={`${r.name}-${i}`} review={r} index={i} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-14 text-center"
        >
          <h3 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-tight text-brand-ink">Me avalia, please!</h3>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {units.map((unit) => (
              <a
                key={unit.label}
                href={reviewUrl(unit)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-[#e63946] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#d62839] hover:shadow-md"
              >
                {unit.label}
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
