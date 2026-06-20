import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { Reveal } from "@/components/parme/reveal";
import { ArrowLeft, Gift, Star, MapPin, ExternalLink } from "lucide-react";
import churrosAsset from "@/assets/churros.avif.asset.json";

type Brand = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  stores: string[];
};

const STORES = ["Águas Claras", "Asa Sul", "Asa Norte", "Lago Sul"];

const BRANDS: Brand[] = [
  {
    id: "parme",
    name: "Aquela Parmê",
    tagline: "Filé à parmegiana e clássicos italianos",
    accent: "bg-brand-parme",
    stores: STORES,
  },
  {
    id: "estrogonofe",
    name: "Estrogonofe de Carne",
    tagline: "O verdadeiro estrogonofe cremoso",
    accent: "bg-brand-estrogonofe",
    stores: STORES,
  },
  {
    id: "box-caipira",
    name: "Box Caipira",
    tagline: "Comida raiz, tempero de fogão de lenha",
    accent: "bg-brand-box",
    stores: STORES,
  },
];

function reviewUrl(brand: string, store: string) {
  const query = encodeURIComponent(`${brand} ${store} Brasília`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export default function SurpresaPage() {
  useEffect(() => {
    document.title = "Surpresa — Aquela Parmê";
  }, []);

  return (
    <SiteLayout>
      {/* HERO */}
      <section className="relative overflow-hidden bg-brand-parme py-16 md:py-24">
        <div className="relative z-10 mx-auto max-w-6xl px-5 md:px-6">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="text-center md:text-left">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7 }}
                className="text-lg font-medium text-brand-parme-foreground/80"
              >
                uma surpresinha pra você
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] leading-tight text-brand-parme-foreground"
              >
                Avaliou a Parmê?
                <br />
                Ganhou churros.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.2 }}
                className="mx-auto mt-5 max-w-md text-base text-brand-parme-foreground/85 md:mx-0"
              >
                Como agradecimento pela sua avaliação, a gente te entrega uma porção
                de churros quentinha na nossa loja física da Asa Norte.
                <span className="block mt-2 font-medium">Válido para consumo a partir de R$ 50,00.</span>
              </motion.p>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="mx-auto max-w-sm md:max-w-none"
            >
              <img
                src={churrosAsset.url}
                alt="Porção de churros da Aquela Parmê"
                className="rounded-2xl shadow-lg"
                loading="eager"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          <Reveal>
            <p className="text-lg font-medium text-muted-foreground">como funciona</p>
            <h2 className="mt-1 font-display text-3xl md:text-4xl text-foreground">
              Três passos e o churros é seu
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Star,
                titulo: "1. Avalie a gente",
                texto: "Deixe sua avaliação honesta no Google sobre a Aquela Parmê.",
              },
              {
                icon: Gift,
                titulo: "2. Mostre na loja",
                texto: "Apresente a avaliação no caixa da nossa loja física da Asa Norte.",
              },
              {
                icon: MapPin,
                titulo: "3. Receba o churros",
                texto: "A gente prepara uma porção fresquinha pra você saborear na hora.",
              },
            ].map((p, i) => (
              <Reveal key={p.titulo} delay={i * 0.1}>
                <article className="h-full rounded-2xl bg-card p-6 shadow-card ring-1 ring-border">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-parme/10">
                    <p.icon className="h-5 w-5 text-brand-parme" />
                  </div>
                  <h3 className="mt-4 font-display text-xl text-foreground">
                    {p.titulo}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.texto}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* AVALIE A GENTE */}
      <section className="bg-muted py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-5 text-center md:px-6">
          <Reveal>
            <Star className="mx-auto h-8 w-8 text-brand-parme" />
            <h2 className="mt-4 font-display text-2xl md:text-3xl text-foreground">
              Me avalia, please!
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
              Escolha a loja que você visitou e deixe sua avaliação no Google. Depois é só vir buscar o churros.
            </p>
          </Reveal>

          <BrandStoreSelector />
        </div>
      </section>


      {/* ONDE RESGATAR */}
      <section className="bg-store-asa-norte py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:px-6 md:grid-cols-2 md:items-center">
          <Reveal>
            <p className="text-lg font-medium text-store-asa-norte-foreground/80">
              onde resgatar
            </p>
            <h2 className="mt-1 font-display text-3xl md:text-4xl text-store-asa-norte-foreground">
              Aquela Parmê — Asa Norte
            </h2>
            <p className="mt-4 text-store-asa-norte-foreground/85">
              Passe na nossa loja física da Asa Norte, mostre sua avaliação pro
              atendente e leve o churros. Válido enquanto durarem as porções do
              dia, um por cliente.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl bg-card p-6 shadow-card ring-1 ring-border">
              <h3 className="font-display text-xl text-foreground">
                Regrinhas básicas
              </h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Consumo mínimo de R$ 50,00.</li>
                <li>• 1 porção de churros por cliente.</li>
                <li>• Resgate presencial na loja da Asa Norte.</li>
                <li>• Necessário mostrar a avaliação publicada.</li>
                <li>• Não é cumulativo com outras promoções.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteLayout>
  );
}

function BrandStoreSelector() {
  const [selected, setSelected] = useState<Brand | null>(null);

  return (
    <div className="mt-10">
      <AnimatePresence mode="wait" initial={false}>
        {!selected ? (
          <motion.div
            key="brands"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-4 sm:grid-cols-3"
          >
            {BRANDS.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setSelected(brand)}
                className="group rounded-2xl bg-card p-6 text-left shadow-card ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span
                  className={`inline-block h-2 w-10 rounded-full ${brand.accent}`}
                  aria-hidden
                />
                <h3 className="mt-4 font-display text-xl text-foreground">
                  {brand.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {brand.tagline}
                </p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground/80 group-hover:text-foreground">
                  escolher loja →
                </p>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key={`stores-${selected.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> trocar marca
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${selected.accent}`}
                  aria-hidden
                />
                <p className="font-display text-lg text-foreground">
                  {selected.name}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Em qual loja você nos visitou?
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {selected.stores.map((store) => (
                <a
                  key={store}
                  href={reviewUrl(selected.name, store)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm ring-1 ring-border transition hover:bg-muted"
                >
                  {store}
                  <ExternalLink className="h-4 w-4 opacity-70" />
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

