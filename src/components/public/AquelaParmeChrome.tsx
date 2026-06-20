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
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 grid gap-12 md:grid-cols-2">
        <div>
          <h4 className="text-3xl md:text-4xl mb-6">Entre em contato</h4>
          <ul className="space-y-4">
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
        <div>
          <h4 className="text-3xl md:text-4xl mb-6">Navegue pelo site</h4>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-4">
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
              <Link to="/vagas" className="ap-footer-link">
                Trabalhe conosco
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: "hsl(var(--ap-cream-2) / .25)" }}>
        <div
          className="max-w-6xl mx-auto px-6 md:px-10 py-5 ap-sans text-xs flex flex-col md:flex-row gap-2 md:items-center md:justify-between"
          style={{ color: "hsl(var(--ap-cream-2) / .85)" }}
        >
          <span>Política de Privacidade · Termos de Serviço</span>
          <span>© {new Date().getFullYear()} Aquela Parmê. Todos os direitos reservados.</span>
        </div>
      </div>
    </footer>
  );
}
