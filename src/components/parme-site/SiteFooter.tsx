import { Link } from "react-router-dom";
import { AtSign, Globe, Mail, MapPin, Clock } from "lucide-react";

const navLinks = [
  { to: "/parme", label: "Home" },
  { to: "/parme/aquela-parme", label: "Aquela Parmê" },
  { to: "/parme/aquele-estrogonofe", label: "Aquele Estrogonofe" },
  { to: "/parme/box-caipira", label: "Box Caipira" },
  { to: "/parme/sobre", label: "Nossa história" },
  { to: "/parme/reservar", label: "Reservar mesa" },
];

export function SiteFooter() {
  return (
    <>
      <div className="parme-wave" aria-hidden />
      <footer className="bg-brand-orange text-brand-cream">
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 md:px-6 md:pb-16">
          <h3 className="font-display text-2xl md:text-4xl">Entre em contato</h3>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-6 md:gap-8">
            <a
              href="https://instagram.com/aquelaparme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              Instagram <AtSign className="h-4 w-4" />
            </a>
            <a
              href="https://facebook.com/aquelaparme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              Facebook <Globe className="h-4 w-4" />
            </a>
            <a
              href="mailto:contato@aquelaparme.com.br"
              className="inline-flex items-center gap-2 border-b border-brand-cream/70 pb-1 text-base font-semibold transition hover:text-brand-ink"
            >
              E-mail <Mail className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <Link
                to="/parme/enderecos"
                className="inline-block font-display text-xl underline-offset-4 transition hover:underline md:text-3xl"
              >
                Onde estamos
              </Link>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">4 unidades em Brasília</p>
                    <p className="opacity-90">
                      Asa Norte · Asa Sul · Lago Sul · Águas Claras
                    </p>
                    <Link
                      to="/parme/enderecos"
                      className="mt-1 inline-block border-b border-brand-cream/70 pb-0.5 font-semibold transition hover:text-brand-ink"
                    >
                      Ver todos os endereços
                    </Link>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Horário de funcionamento</p>
                    <p className="opacity-90">Todos os dias: 11h – 22h</p>
                    <p className="opacity-90">Inclusive feriados</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-display text-xl md:text-3xl">Navegue pelo site</h4>
              <nav className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-base font-semibold">
                {navLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="border-b border-brand-cream/70 pb-1 transition hover:text-brand-ink"
                  >
                    {l.label}
                  </Link>
                ))}
                <a
                  href="https://nexasuite.aquelaparme.com.br/vagas"
                  className="border-b border-brand-cream/70 pb-1 transition hover:text-brand-ink"
                >
                  Junte-se a nós
                </a>
              </nav>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 text-xs opacity-90 md:flex-row md:items-center">
            <p>Política de Privacidade · Termos de Serviço</p>
            <p>
              {new Date().getFullYear()} · NEXA Gestão Inteligente. Todos os
              direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
