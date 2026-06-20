import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail, Calendar } from "lucide-react";

// Logo do site refeito (servido pela CDN do Lovable em aquelaparme.com.br)
const LOGO_URL =
  "https://aquelaparme.com.br/__l5e/assets-v1/08f2d7b0-9a37-450b-91db-83362d133960/Logo-Aquela-Parme.webp";
const SITE = "https://aquelaparme.com.br";

const NAV = [
  { label: "Home", href: SITE },
  { label: "Aquela Parmê", href: `${SITE}/aquela-parme` },
  { label: "Aquele estrogonofe", href: `${SITE}/aquele-estrogonofe` },
  { label: "Box caipira", href: `${SITE}/box-caipira` },
  { label: "Sobre", href: `${SITE}/sobre` },
];

export function ApFloatingHeader() {
  return (
    <header className="ap-header-floating">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
        {/* Nav esquerda */}
        <nav className="hidden lg:flex items-center gap-6 text-sm">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ap-nav-link"
            >
              {n.label}
            </a>
          ))}
        </nav>

        {/* Logo centralizado */}
        <a
          href={SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center"
        >
          <img
            src={LOGO_URL}
            alt="Aquela Parmê"
            className="h-12 md:h-14 w-auto"
          />
        </a>

        {/* Lado direito */}
        <div className="flex items-center gap-3 md:gap-5">
          <Link to="/vagas" className="ap-nav-link active hidden sm:inline">
            Trabalhe conosco
          </Link>
          <a
            href={SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="ap-btn-outline inline-flex items-center gap-2 text-sm whitespace-nowrap"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Faça sua reserva</span>
            <span className="sm:hidden">Reservar</span>
          </a>
        </div>
      </div>

      {/* Nav mobile */}
      <nav className="lg:hidden mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
        {NAV.map((n) => (
          <a
            key={n.label}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ap-nav-link"
          >
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function ApFooter() {
  return (
    <footer className="ap-footer">
      <div className="ap-footer-wave" aria-hidden="true" />
      <div className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-10 grid gap-10 md:grid-cols-3">
        {/* Coluna 1 — Contato */}
        <div>
          <h4 className="text-3xl md:text-4xl mb-6">Entre em contato</h4>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <li>
              <a
                href="https://www.instagram.com/aquelaparme"
                target="_blank"
                rel="noopener noreferrer"
                className="ap-footer-link inline-flex items-center gap-2"
              >
                Instagram <Instagram className="h-4 w-4" />
              </a>
            </li>
            <li>
              <a
                href="https://www.facebook.com/aquelaparme"
                target="_blank"
                rel="noopener noreferrer"
                className="ap-footer-link inline-flex items-center gap-2"
              >
                Facebook <Facebook className="h-4 w-4" />
              </a>
            </li>
            <li>
              <a
                href="mailto:contato@aquelaparme.com.br"
                className="ap-footer-link inline-flex items-center gap-2"
              >
                E-mail <Mail className="h-4 w-4" />
              </a>
            </li>
          </ul>
        </div>

        {/* Coluna 2 — Onde estamos */}
        <div>
          <h4 className="text-3xl md:text-4xl mb-6">Onde estamos</h4>
          <ul className="space-y-4 ap-sans text-sm" style={{ color: "hsl(var(--ap-cream))" }}>
            <li className="flex gap-3">
              <MapPin className="h-4 w-4 mt-1 shrink-0" />
              <div>
                <p className="font-semibold">Unidade Asa Norte</p>
                <p>114 Norte, Asa Norte, Brasília/DF</p>
                <a
                  href="https://maps.google.com/?q=Aquela+Parme+Asa+Norte+Brasilia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ap-footer-link inline-block mt-1"
                >
                  Ver no Google Maps
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Clock className="h-4 w-4 mt-1 shrink-0" />
              <div>
                <p className="font-semibold">Horário de funcionamento</p>
                <p>Seg a Qui: 11h30 – 23h</p>
                <p>Sex e Sáb: 11h30 – 00h</p>
                <p>Dom: 11h30 – 22h</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Coluna 3 — Navegue pelo site */}
        <div>
          <h4 className="text-3xl md:text-4xl mb-6">Navegue pelo site</h4>
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {NAV.map((n) => (
              <li key={n.label}>
                <a
                  href={n.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ap-footer-link"
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={SITE}
                target="_blank"
                rel="noopener noreferrer"
                className="ap-footer-link"
              >
                Reservar mesa
              </a>
            </li>
            <li>
              <Link to="/vagas" className="ap-footer-link">
                Trabalhe conosco
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div
        className="max-w-6xl mx-auto px-6 md:px-10 pb-6 ap-sans text-xs flex flex-col md:flex-row gap-2 md:items-center md:justify-between"
        style={{ color: "hsl(var(--ap-cream) / .9)" }}
      >
        <span>Política de Privacidade · Termos de Serviço</span>
        <span>{new Date().getFullYear()} · Aquela Parmê. Todos os direitos reservados.</span>
      </div>
    </footer>
  );
}

