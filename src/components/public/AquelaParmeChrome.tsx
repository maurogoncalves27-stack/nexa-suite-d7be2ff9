import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X, ChevronRight, MessageCircle, CalendarDays, AtSign, Globe, Mail, MapPin, Clock } from "lucide-react";

/* ─── Logo da CDN do site oficial ─── */
const LOGO_URL =
  "https://aquelaparme.com.br/__l5e/assets-v1/08f2d7b0-9a37-450b-91db-83362d133960/Logo-Aquela-Parme.webp";
const SITE = "https://aquelaparme.com.br";
const WHATSAPP_URL = "https://wa.me/5561999999999"; /* placeholder – site usa dinâmico */

const leftLinks = [
  { to: SITE + "/", label: "Home", external: true },
  { to: SITE + "/aquela-parme", label: "Aquela Parmê", external: true },
  { to: SITE + "/aquele-estrogonofe", label: "Aquele estrogonofe", external: true },
  { to: SITE + "/box-caipira", label: "Box caipira", external: true },
  { to: SITE + "/sobre", label: "Sobre", external: true },
] as const;

/* ─── Onda do rodapé (DrippingWave) — igual ao site oficial ─── */
function DrippingWave({ color = "#ef6b3a", bg = "#fff7e6" }: { color?: string; bg?: string }) {
  return (
    <div aria-hidden style={{ background: bg }}>
      <svg viewBox="0 0 1440 180" preserveAspectRatio="none" className="block h-28 w-full md:h-36">
        <path
          d="M0,105 C 48,105 96,75 144,75 C 192,75 240,105 288,105 C 336,105 384,75 432,75 C 480,75 528,105 576,105 C 624,105 672,75 720,75 C 768,75 816,105 864,105 C 912,105 960,75 1008,75 C 1056,75 1104,105 1152,105 C 1200,105 1248,75 1296,75 C 1344,75 1392,105 1440,105 L 1440,180 L 0,180 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HEADER  —  cópia fiel do site-header.tsx do site oficial
   ═══════════════════════════════════════════════════════════ */
export function ApFloatingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isVagas = location.pathname.startsWith("/vagas");

  return (
    <header className="ap-header-floating sticky top-0 z-40 bg-brand-ink text-brand-cream">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 md:gap-4 md:px-6 md:py-4">
        {/* Nav esquerda — desktop */}
        <nav className="hidden items-center gap-7 lg:flex">
          {leftLinks.map((l) => (
            <a
              key={l.label}
              href={l.to}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-semibold leading-tight text-brand-cream/90 transition-colors hover:text-primary"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Logo centralizado */}
        <a
          href={SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <img src={LOGO_URL} alt="Aquela Parmê" className="h-10 w-auto md:h-14" />
        </a>

        {/* Lado direito — desktop */}
        <div className="hidden items-center justify-end gap-3 lg:flex">
          <Link
            to="/vagas"
            className={`text-[15px] font-semibold transition hover:text-primary ${
              isVagas ? "text-primary" : "text-brand-cream/90"
            }`}
          >
            Trabalhe conosco
          </Link>
          <a
            href={SITE + "/reservar"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-brand-cream/80 bg-transparent px-4 py-2 text-sm font-semibold text-brand-cream transition hover:bg-brand-cream hover:text-brand-ink"
          >
            <CalendarDays className="h-4 w-4" />
            Faça sua reserva
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden group items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#1ebe57]"
          >
            <MessageCircle className="h-4 w-4" />
            Peça pelo WhatsApp
            <span className="grid h-5 w-5 place-items-center rounded-full border border-current">
              <ChevronRight className="h-3 w-3" />
            </span>
          </a>
        </div>

        {/* Hamburger — mobile */}
        <button
          type="button"
          className="col-start-3 ml-auto -mr-1 grid h-11 w-11 place-items-center rounded-md lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menu mobile */}
      {open && (
        <nav className="border-t border-brand-cream/10 bg-brand-ink px-4 py-3 lg:hidden">
          <ul className="flex flex-col gap-1">
            {leftLinks.map((l) => (
              <li key={l.label}>
                <a
                  href={l.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-3 text-base font-semibold"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/vagas" onClick={() => setOpen(false)} className={`block rounded-md px-3 py-3 text-base font-semibold ${isVagas ? "text-primary" : ""}`}>
                Trabalhe conosco
              </Link>
            </li>
            <li>
              <a
                href={SITE + "/reservar"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full border border-brand-cream/80 px-4 py-3 text-center text-base font-semibold"
              >
                Faça sua reserva
              </a>
            </li>
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden mt-2 block rounded-full bg-[#25D366] px-4 py-2 text-center text-base font-semibold text-white"
              >
                Peça pelo WhatsApp
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════
   FOOTER  —  cópia fiel do site-footer.tsx do site oficial
   ═══════════════════════════════════════════════════════════ */
const navLinks = [
  { to: SITE + "/", label: "Home", external: true },
  { to: SITE + "/aquela-parme", label: "Aquela Parme", external: true },
  { to: SITE + "/aquele-estrogonofe", label: "Aquele estrogonofe", external: true },
  { to: SITE + "/box-caipira", label: "Box caipira", external: true },
  { to: SITE + "/sobre", label: "Sobre", external: true },
  { to: SITE + "/reservar", label: "Reservar mesa", external: true },
  { to: "/vagas", label: "Trabalhe conosco", external: false },
] as const;

export function ApFooter() {
  return (
    <>
      <DrippingWave color="#ef6b3a" bg="#fff7e6" />
      <footer className="ap-footer bg-[#ef6b3a] text-brand-cream">
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 md:px-6 md:pb-16 md:pt-2">
          <h3 className="font-display text-2xl md:text-4xl">Entre em contato</h3>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-6 md:gap-8">
            <a
              href="https://instagram.com/aquelaparme"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram do Aquela Parmê"
              className="ap-footer-link inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              Instagram <AtSign className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook do Aquela Parmê"
              className="ap-footer-link inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              Facebook <Globe className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="mailto:contato@aquelaparme.com.br"
              aria-label="E-mail para contato"
              className="ap-footer-link inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              E-mail <Mail className="h-4 w-4" aria-hidden />
            </a>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <h4 className="font-display text-xl md:text-3xl">Onde estamos</h4>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">Unidade Asa Norte</p>
                    <p className="text-brand-cream/90">114 Norte, Asa Norte, Brasília — DF</p>
                    <a
                      href="https://maps.google.com/?q=Aquela+Parme+Asa+Norte+Brasilia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block border-b border-brand-cream/70 pb-0.5 font-semibold transition hover:text-brand-ink"
                    >
                      Ver no Google Maps
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">Horário de funcionamento</p>
                    <p className="text-brand-cream/90">Seg a Qui: 11h30 – 23h</p>
                    <p className="text-brand-cream/90">Sex e Sáb: 11h30 – 00h</p>
                    <p className="text-brand-cream/90">Dom: 11h30 – 22h</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-display text-xl md:text-3xl">Navegue pelo site</h4>
              <nav className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-base font-semibold" aria-label="Rodapé">
                {navLinks.map((l) =>
                  l.external ? (
                    <a
                      key={l.label}
                      href={l.to}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ap-footer-link border-b border-brand-cream/70 pb-1 transition hover:text-brand-ink"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      to={l.to}
                      className="ap-footer-link border-b border-brand-cream/70 pb-1 transition hover:text-brand-ink"
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </nav>
            </div>
          </div>

          <div className="ap-footer-bottom mt-12 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <p>Política de Privacidade · Termos de Serviço</p>
            <p>{new Date().getFullYear()} · Aquela Parmê. Todos direitos reservados.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
