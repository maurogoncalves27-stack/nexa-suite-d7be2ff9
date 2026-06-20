import { Link } from "react-router-dom";
import { AtSign, Globe, Mail, MapPin, Clock } from "lucide-react";
import { DrippingWave } from "@/components/parme/dripping-wave";

const navLinks = [
  { to: "/parme", label: "Home" },
  { to: "/parme/aquela-parme", label: "Aquela Parme" },
  { to: "/parme/aquele-estrogonofe", label: "Aquele estrogonofe" },
  { to: "/parme/box-caipira", label: "Box caipira" },
  { to: "/parme/sobre", label: "Nossa história" },
  { to: "/parme/reservar", label: "Reservar mesa" },
  { href: "https://nexasuite.aquelaparme.com.br/vagas", label: "Junte-se a nós" },
] as const;

export function SiteFooter() {
  return (
    <>
      <DrippingWave color="#ef6b3a" bg="#fff7e6" />
      <footer style={{ background: "#ef6b3a", color: "#fff7e6" }}>
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 md:px-6 md:pb-16 md:pt-2">
          <h3 className="font-display text-2xl md:text-4xl">Entre em contato</h3>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-6 md:gap-8">
            <a
              href="https://instagram.com/aquelaparme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-b pb-1 text-base font-semibold transition hover:opacity-80"
              style={{ borderColor: "rgba(255,247,230,0.7)" }}
            >
              Instagram <AtSign className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-b pb-1 text-base font-semibold transition hover:opacity-80"
              style={{ borderColor: "rgba(255,247,230,0.7)" }}
            >
              Facebook <Globe className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="mailto:contato@aquelaparme.com.br"
              className="inline-flex items-center gap-2 border-b pb-1 text-base font-semibold transition hover:opacity-80"
              style={{ borderColor: "rgba(255,247,230,0.7)" }}
            >
              E-mail <Mail className="h-4 w-4" aria-hidden />
            </a>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <Link to="/parme/enderecos" className="inline-block font-display text-xl underline-offset-4 transition hover:underline md:text-3xl">
                Onde estamos
              </Link>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">4 unidades em Brasília</p>
                    <p style={{ color: "rgba(255,247,230,0.9)" }}>Asa Norte · Asa Sul · Lago Sul · Águas Claras</p>
                    <Link to="/parme/enderecos" className="mt-1 inline-block border-b pb-0.5 font-semibold transition" style={{ borderColor: "rgba(255,247,230,0.7)" }}>
                      Ver todos os endereços
                    </Link>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">Horário de funcionamento</p>
                    <p style={{ color: "rgba(255,247,230,0.9)" }}>Todos os dias: 11h – 22h</p>
                    <p style={{ color: "rgba(255,247,230,0.9)" }}>Inclusive feriados</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-display text-xl md:text-3xl">Navegue pelo site</h4>
              <nav className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-base font-semibold" aria-label="Rodapé">
                {navLinks.map((l) =>
                  "href" in l ? (
                    <a key={l.href} href={l.href} className="border-b pb-1 transition hover:opacity-80" style={{ borderColor: "rgba(255,247,230,0.7)" }}>
                      {l.label}
                    </a>
                  ) : (
                    <Link key={l.to} to={l.to} className="border-b pb-1 transition hover:opacity-80" style={{ borderColor: "rgba(255,247,230,0.7)" }}>
                      {l.label}
                    </Link>
                  )
                )}
              </nav>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 text-xs md:flex-row md:items-center" style={{ color: "rgba(255,247,230,0.9)" }}>
            <p>Política de Privacidade · Termos de Serviço</p>
            <p>{new Date().getFullYear()} · Aquela Parmê. Todos direitos reservados.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
