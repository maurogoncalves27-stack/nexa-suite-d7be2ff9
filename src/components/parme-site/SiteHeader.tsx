import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { Menu, X, CalendarDays } from "lucide-react";

const links = [
  { to: "/parme", label: "Home", end: true },
  { to: "/parme/aquela-parme", label: "Aquela Parmê" },
  { to: "/parme/aquele-estrogonofe", label: "Aquele Estrogonofe" },
  { to: "/parme/box-caipira", label: "Box Caipira" },
  { to: "/parme/sobre", label: "Nossa história" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-brand-ink text-brand-cream">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 md:gap-4 md:px-6 md:py-4">
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `text-[15px] font-semibold leading-tight transition-colors hover:opacity-80 ${
                  isActive ? "text-brand-red" : "text-brand-cream"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/parme"
          className="flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <span className="font-display text-2xl md:text-3xl text-brand-cream">
            Aquela Parmê
          </span>
        </Link>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <a
            href="https://nexasuite.aquelaparme.com.br/vagas"
            className="text-[15px] font-semibold transition hover:opacity-80"
          >
            Junte-se a nós
          </a>
          <Link
            to="/parme/reservar"
            className="inline-flex items-center gap-2 rounded-full border border-brand-cream/80 px-4 py-2 text-sm font-semibold transition hover:bg-brand-cream hover:text-brand-ink"
          >
            <CalendarDays className="h-4 w-4" />
            Faça sua reserva
          </Link>
        </div>

        <button
          type="button"
          className="col-start-3 ml-auto -mr-1 grid h-11 w-11 place-items-center rounded-md lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-brand-cream/10 bg-brand-ink px-4 py-3 lg:hidden">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-3 text-base font-semibold ${
                      isActive ? "text-brand-red" : ""
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li>
              <a
                href="https://nexasuite.aquelaparme.com.br/vagas"
                className="block rounded-md px-3 py-3 text-base font-semibold"
              >
                Junte-se a nós
              </a>
            </li>
            <li>
              <Link
                to="/parme/reservar"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full border border-brand-cream/80 px-4 py-3 text-center text-base font-semibold"
              >
                Faça sua reserva
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
