import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X, ChevronRight, MessageCircle, CalendarDays, AtSign, Globe, Mail, MapPin, Clock } from "lucide-react";

/* ─── Logo da CDN do site oficial ─── */
const LOGO_URL =
  "https://aquelaparme.com.br/__l5e/assets-v1/08f2d7b0-9a37-450b-91db-83362d133960/Logo-Aquela-Parme.webp";
const SITE = "https://aquelaparme.com.br";
const WHATSAPP_URL = "https://wa.me/5561999999999";

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
      <svg viewBox="0 0 1440 180" preserveAspectRatio="none" style={{ display: "block", height: "clamp(7rem, 10vw, 9rem)", width: "100%" }}>
        <path
          d="M0,105 C 48,105 96,75 144,75 C 192,75 240,105 288,105 C 336,105 384,75 432,75 C 480,75 528,105 576,105 C 624,105 672,75 720,75 C 768,75 816,105 864,105 C 912,105 960,75 1008,75 C 1056,75 1104,105 1152,105 C 1200,105 1248,75 1296,75 C 1344,75 1392,105 1440,105 L 1440,180 L 0,180 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HEADER  —  cópia fiel do site oficial
   ═══════════════════════════════════════════════════════════ */
export function ApFloatingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isVagas = location.pathname.startsWith("/vagas");

  return (
    <header className="ap-header">
      <div className="ap-header-inner">
        {/* Nav esquerda — desktop */}
        <nav className="ap-header-nav">
          {leftLinks.map((l) => (
            <a
              key={l.label}
              href={l.to}
              target="_blank"
              rel="noopener noreferrer"
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
          className="ap-header-logo"
          onClick={() => setOpen(false)}
        >
          <img src={LOGO_URL} alt="Aquela Parmê" />
        </a>

        {/* Lado direito — desktop */}
        <div className="ap-header-right">
          <Link
            to="/vagas"
            style={{ fontSize: "15px", fontWeight: 600, textDecoration: "none", color: isVagas ? "hsl(var(--ap-red-soft))" : "hsl(var(--ap-cream-2) / .9)" }}
            className="ap-hover-text-red"
          >
            Trabalhe conosco
          </Link>
          <a
            href={SITE + "/reservar"}
            target="_blank"
            rel="noopener noreferrer"
            className="ap-header-btn-outline"
          >
            <CalendarDays style={{ height: "1rem", width: "1rem" }} />
            Faça sua reserva
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "none" }}
          >
            <MessageCircle style={{ height: "1rem", width: "1rem" }} />
            Peça pelo WhatsApp
            <span>
              <ChevronRight style={{ height: "0.75rem", width: "0.75rem" }} />
            </span>
          </a>
        </div>

        {/* Hamburger — mobile */}
        <button
          type="button"
          className="ap-header-hamburger"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X style={{ height: "1.5rem", width: "1.5rem" }} /> : <Menu style={{ height: "1.5rem", width: "1.5rem" }} />}
        </button>
      </div>

      {/* Menu mobile */}
      {open && (
        <nav className="ap-header-mobile">
          <ul>
            {leftLinks.map((l) => (
              <li key={l.label}>
                <a
                  href={l.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/vagas" onClick={() => setOpen(false)} style={{ color: isVagas ? "hsl(var(--ap-red-soft))" : undefined }}>
                Trabalhe conosco
              </Link>
            </li>
            <li>
              <a
                href={SITE + "/reservar"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="ap-header-btn-outline"
              >
                Faça sua reserva
              </a>
            </li>
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "none" }}
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
   FOOTER  —  cópia fiel do site oficial
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
      <footer className="ap-footer">
        <div className="ap-footer-inner">
          <h3>Entre em contato</h3>

          <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.5rem 1.5rem" }}>
            <a
              href="https://instagram.com/aquelaparme"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram do Aquela Parmê"
              className="ap-footer-link"
              style={{ borderBottom: "1px solid hsl(var(--ap-cream) / .7)", paddingBottom: "0.25rem" }}
            >
              Instagram <AtSign style={{ height: "1rem", width: "1rem" }} aria-hidden />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook do Aquela Parmê"
              className="ap-footer-link"
              style={{ borderBottom: "1px solid hsl(var(--ap-cream) / .7)", paddingBottom: "0.25rem" }}
            >
              Facebook <Globe style={{ height: "1rem", width: "1rem" }} aria-hidden />
            </a>
            <a
              href="mailto:contato@aquelaparme.com.br"
              aria-label="E-mail para contato"
              className="ap-footer-link"
              style={{ borderBottom: "1px solid hsl(var(--ap-cream) / .7)", paddingBottom: "0.25rem" }}
            >
              E-mail <Mail style={{ height: "1rem", width: "1rem" }} aria-hidden />
            </a>
          </div>

          <div className="ap-footer-grid">
            <div>
              <h4>Onde estamos</h4>
              <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                  <MapPin style={{ marginTop: "0.125rem", height: "1rem", width: "1rem", flexShrink: 0 }} aria-hidden />
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>Unidade Asa Norte</p>
                    <p style={{ color: "hsl(var(--ap-cream) / .9)", margin: 0 }}>114 Norte, Asa Norte, Brasília — DF</p>
                    <a
                      href="https://maps.google.com/?q=Aquela+Parme+Asa+Norte+Brasilia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ap-footer-link"
                      style={{ marginTop: "0.25rem", fontSize: "0.875rem" }}
                    >
                      Ver no Google Maps
                    </a>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                  <Clock style={{ marginTop: "0.125rem", height: "1rem", width: "1rem", flexShrink: 0 }} aria-hidden />
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>Horário de funcionamento</p>
                    <p style={{ color: "hsl(var(--ap-cream) / .9)", margin: 0 }}>Seg a Qui: 11h30 – 23h</p>
                    <p style={{ color: "hsl(var(--ap-cream) / .9)", margin: 0 }}>Sex e Sáb: 11h30 – 00h</p>
                    <p style={{ color: "hsl(var(--ap-cream) / .9)", margin: 0 }}>Dom: 11h30 – 22h</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4>Navegue pelo site</h4>
              <nav style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "2rem 2rem", fontSize: "1rem", fontWeight: 600 }} aria-label="Rodapé">
                {navLinks.map((l) =>
                  l.external ? (
                    <a
                      key={l.label}
                      href={l.to}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ap-footer-link"
                      style={{ borderBottom: "1px solid hsl(var(--ap-cream) / .7)", paddingBottom: "0.25rem" }}
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      to={l.to}
                      className="ap-footer-link"
                      style={{ borderBottom: "1px solid hsl(var(--ap-cream) / .7)", paddingBottom: "0.25rem" }}
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </nav>
            </div>
          </div>

          <div className="ap-footer-bottom">
            <p style={{ margin: 0 }}>Política de Privacidade · Termos de Serviço</p>
            <p style={{ margin: 0 }}>{new Date().getFullYear()} · Aquela Parmê. Todos direitos reservados.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
