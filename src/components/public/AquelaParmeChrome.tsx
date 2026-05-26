import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";

const LOGO_URL = "https://aquelaparme.com.br/wp-content/uploads/2025/12/Logo-Aquela-Parme.webp";
const SITE = "https://aquelaparme.com.br";

export function ApFloatingHeader() {
  return (
    <header className="ap-header-floating">
      <div className="flex items-center justify-between gap-3">
        <a href={SITE} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 pl-2">
          <img src={LOGO_URL} alt="Aquela Parmê" className="h-10 md:h-12 w-auto" />
        </a>
        <nav className="hidden md:flex items-center gap-6 ap-sans text-sm font-medium">
          <a href={SITE} className="hover:opacity-80" target="_blank" rel="noopener noreferrer">Home</a>
          <Link to="/vagas" className="hover:opacity-80">Trabalhe conosco</Link>
          <a href={`${SITE}/#sobre`} className="hover:opacity-80" target="_blank" rel="noopener noreferrer">Sobre</a>
        </nav>
        <a
          href={SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="ap-btn-outline text-sm"
          style={{ padding: "0.4rem 0.9rem" }}
        >
          Voltar ao site
        </a>
      </div>
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
            <li>
              <a href={SITE} target="_blank" rel="noopener noreferrer" className="ap-footer-link">
                Home
              </a>
            </li>
            <li>
              <a href={`${SITE}/#aquela-parme`} target="_blank" rel="noopener noreferrer" className="ap-footer-link">
                Aquela Parme
              </a>
            </li>
            <li>
              <a href={`${SITE}/#estrogonofe`} target="_blank" rel="noopener noreferrer" className="ap-footer-link">
                Aquele estrogonofe
              </a>
            </li>
            <li>
              <a href={`${SITE}/#box-caipira`} target="_blank" rel="noopener noreferrer" className="ap-footer-link">
                Box caipira
              </a>
            </li>
            <li>
              <a href={`${SITE}/#sobre`} target="_blank" rel="noopener noreferrer" className="ap-footer-link">
                Sobre
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: "hsl(var(--ap-cream) / .25)" }}>
        <div
          className="max-w-6xl mx-auto px-6 md:px-10 py-5 ap-sans text-xs flex flex-col md:flex-row gap-2 md:items-center md:justify-between"
          style={{ color: "hsl(var(--ap-cream) / .85)" }}
        >
          <span>Política de Privacidade · Termos de Serviço</span>
          <span>2025 - Aquela parme. Todos direitos reservados.</span>
        </div>
      </div>
    </footer>
  );
}
