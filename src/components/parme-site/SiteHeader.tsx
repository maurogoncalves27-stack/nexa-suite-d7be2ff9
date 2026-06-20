import { Link } from "react-router-dom";
import { useState } from "react";
import { Menu, X, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { parmeAssets } from "@/assets/parme-assets";

const leftLinks = [
  { to: "/parme", label: "Home" },
  { to: "/parme/aquela-parme", label: "Aquela Parmê" },
  { to: "/parme/aquele-estrogonofe", label: "Aquele estrogonofe" },
  { to: "/parme/box-caipira", label: "Box caipira" },
  { to: "/parme/sobre", label: "Nossa história" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const logo = parmeAssets.Logo_Aquela_Parme;

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-40 bg-brand-ink text-brand-cream"
    >
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 md:gap-4 md:px-6 md:py-4">
        <nav className="hidden items-center gap-7 lg:flex">
          {leftLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-[15px] font-semibold leading-tight transition-colors hover:opacity-80"
              style={{ color: "rgba(255,247,230,0.9)" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Link to="/parme" className="flex items-center justify-center" onClick={() => setOpen(false)}>
          <img src={logo} alt="Aquela Parmê" className="h-10 w-auto md:h-14" />
        </Link>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <Link
            to="/vagas"
            className="text-[15px] font-semibold transition hover:opacity-80"
            style={{ color: "rgba(255,247,230,0.9)" }}
          >
            Junte-se a nós
          </Link>
          <Link
            to="/parme/reservar"
            className="inline-flex items-center gap-2 rounded-full border bg-transparent px-4 py-2 text-sm font-semibold transition"
            style={{ borderColor: "rgba(255,247,230,0.8)", color: "#fff7e6" }}
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
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="border-t px-4 py-3 lg:hidden" style={{ borderColor: "rgba(255,247,230,0.1)" }}>
          <ul className="flex flex-col gap-1">
            {leftLinks.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-3 text-base font-semibold"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/vagas" onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 text-base font-semibold">
                Junte-se a nós
              </Link>
            </li>
            <li>
              <Link
                to="/parme/reservar"
                onClick={() => setOpen(false)}
                className="mt-2 block rounded-full border px-4 py-3 text-center text-base font-semibold"
                style={{ borderColor: "rgba(255,247,230,0.8)" }}
              >
                Faça sua reserva
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </motion.header>
  );
}
