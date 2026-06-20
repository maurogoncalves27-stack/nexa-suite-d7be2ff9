import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { toast } from "sonner";

const TIMES = [
  "12:00", "12:30", "13:00", "13:30", "14:00",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00",
];

const FN_URL =
  `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/parme-reservation-create`;
const ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "") as string;

function formatBRPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function ParmeReservar() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | { date: string; time: string; party: number }>(null);
  const [phone, setPhone] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  useEffect(() => {
    document.title = "Reservar mesa — Aquela Parmê";
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      phone: String(fd.get("phone") || ""),
      email: String(fd.get("email") || ""),
      reservation_date: String(fd.get("reservation_date") || ""),
      reservation_time: String(fd.get("reservation_time") || ""),
      party_size: Number(fd.get("party_size") || 0),
      notes: String(fd.get("notes") || ""),
    };
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ANON ? { Authorization: `Bearer ${ANON}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setDone({
        date: payload.reservation_date,
        time: payload.reservation_time,
        party: payload.party_size,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reservar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteLayout>
      <section className="mx-auto max-w-xl px-4 py-12">
        <p className="font-script text-2xl text-brand-red">Bora marcar</p>
        <h1 className="mt-1 font-display text-5xl text-brand-red-dark">
          Reservar mesa
        </h1>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--parme-border))] bg-white px-3 py-2 text-sm text-gray-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
          <p>
            Reservas apenas na{" "}
            <span className="font-semibold text-brand-ink">unidade Asa Norte</span>
            {" "}— CLN 114 Bloco B, Loja 60 – Asa Norte, Brasília-DF.
          </p>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          A reserva é confirmada por telefone. Confira o número que você vai deixar.
        </p>

        {done ? (
          <div className="mt-8 rounded-2xl border-2 border-brand-red bg-white p-6 text-center shadow-md">
            <p className="font-display text-3xl text-brand-red">Reserva enviada!</p>
            <p className="mt-2 text-gray-600">
              Pra {done.party} {done.party === 1 ? "pessoa" : "pessoas"} em{" "}
              {new Date(done.date + "T00:00").toLocaleDateString("pt-BR")} às {done.time}.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              A gente entra em contato pra confirmar. Obrigado!
            </p>
            <button
              onClick={() => setDone(null)}
              className="mt-4 rounded-full bg-brand-red px-6 py-2 font-semibold text-white"
            >
              Nova reserva
            </button>
          </div>
        ) : (
          <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
            <Input name="name" label="Seu nome" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="phone"
                label="Telefone / WhatsApp"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="(61) 90000-0000"
                value={phone}
                onChange={(e) => setPhone(formatBRPhone(e.target.value))}
                minLength={14}
              />
              <Input name="email" label="E-mail (opcional)" type="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="reservation_date" label="Data" type="date" required min={today} max={maxDate} />
              <Select name="reservation_time" label="Horário" required options={TIMES} />
              <Input name="party_size" label="Pessoas" type="number" required min={1} max={25} defaultValue={2} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notes">Observações</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                maxLength={500}
                placeholder="Aniversário, alergia, cadeirinha..."
                className="mt-1 w-full rounded-md border border-[hsl(var(--parme-border))] bg-white px-3 py-2 text-sm outline-none focus:border-brand-red"
              />
            </div>
            <button
              disabled={loading}
              className="mt-2 rounded-full bg-brand-red px-6 py-3 font-semibold text-white shadow hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Confirmar reserva"}
            </button>
          </form>
        )}
      </section>
    </SiteLayout>
  );
}

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string },
) {
  const { label, name, ...rest } = props;
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        {...rest}
        className="mt-1 w-full rounded-md border border-[hsl(var(--parme-border))] bg-white px-3 py-2 text-sm outline-none focus:border-brand-red"
      />
    </div>
  );
}

function Select({
  name, label, required, options,
}: { name: string; label: string; required?: boolean; options: string[] }) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        required={required}
        className="mt-1 w-full rounded-md border border-[hsl(var(--parme-border))] bg-white px-3 py-2 text-sm outline-none focus:border-brand-red"
      >
        <option value="">--</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
