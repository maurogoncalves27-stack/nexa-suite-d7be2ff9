import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TIMES = ["12:00","12:30","13:00","13:30","14:00","19:00","19:30","20:00","20:30","21:00","21:30","22:00"];

function formatBRPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ReservarPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | { date: string; time: string; party: number }>(null);
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<null | { paused: boolean; full: boolean }>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  useEffect(() => {
    document.title = "Reservar mesa — Aquela Parmê";
  }, []);

  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setCheckingAvail(true);
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parme-reservation-availability?date=${date}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
        });
        const json = await res.json();
        if (!cancelled) setAvailability({ paused: !!json.paused, full: !!json.full });
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setCheckingAvail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  const unavailable = availability?.paused || availability?.full;

  return (
    <SiteLayout>
      <section className="mx-auto max-w-xl px-4 py-12">
        <p className="font-script text-2xl" style={{ color: "#e8231f" }}>Bora marcar</p>
        <h1 className="mt-1 font-display text-5xl" style={{ color: "#2a1810" }}>Reservar mesa</h1>

        <div className="mt-4 flex items-start gap-2 rounded-lg border bg-white/60 px-3 py-2 text-sm" style={{ borderColor: "rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.7)" }}>
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#e8231f" }} />
          <p>
            Reservas apenas na <span className="font-semibold" style={{ color: "#2a1810" }}>unidade Asa Norte</span>
            <> — CLN 114 Bloco B, Loja 60</>
          </p>
        </div>

        <p className="mt-3 text-sm" style={{ color: "rgba(0,0,0,0.6)" }}>A reserva é confirmada por telefone. Confira o número que você vai deixar.</p>

        {done ? (
          <div className="mt-8 rounded-2xl border-2 bg-white p-6 text-center" style={{ borderColor: "#e8231f" }}>
            <p className="font-display text-3xl" style={{ color: "#e8231f" }}>Reserva enviada!</p>
            <p className="mt-2" style={{ color: "rgba(0,0,0,0.7)" }}>
              Pra {done.party} {done.party === 1 ? "pessoa" : "pessoas"} em {new Date(done.date + "T00:00").toLocaleDateString("pt-BR")} às {done.time}.
            </p>
            <p className="mt-2 text-sm" style={{ color: "rgba(0,0,0,0.6)" }}>A gente entra em contato pra confirmar. Obrigado!</p>
            <button onClick={() => setDone(null)} className="mt-4 rounded-full px-6 py-2 font-semibold text-white" style={{ background: "#e8231f" }}>Nova reserva</button>
          </div>
        ) : (
          <form
            className="mt-8 grid gap-4"
            onSubmit={async (e) => {
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
                const { data, error } = await supabase.functions.invoke("parme-reservation-create", { body: payload });
                if (error) throw error;
                if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
                setDone({ date: payload.reservation_date, time: payload.reservation_time, party: payload.party_size });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erro ao reservar");
              } finally {
                setLoading(false);
              }
            }}
          >
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
              <Input name="email" label="E-mail (opcional)" type="email" autoComplete="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="reservation_date" label="Data" type="date" required min={today} max={maxDate} />
              <Select name="reservation_time" label="Horário" required options={TIMES} />
              <Input name="party_size" label="Pessoas" type="number" required min={1} max={25} defaultValue={2} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notes">Observações</label>
              <textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Aniversário, alergia, cadeirinha..." className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: "rgba(0,0,0,0.15)" }} />
            </div>
            <button disabled={loading} className="mt-2 rounded-full px-6 py-3 font-semibold text-white shadow disabled:opacity-60" style={{ background: "#e8231f" }}>
              {loading ? "Enviando..." : "Confirmar reserva"}
            </button>
          </form>
        )}
      </section>
    </SiteLayout>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, name, ...rest } = props;
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <input id={name} name={name} {...rest} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: "rgba(0,0,0,0.15)" }} />
    </div>
  );
}

function Select({ name, label, required, options }: { name: string; label: string; required?: boolean; options: string[] }) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={name}>{label}</label>
      <select id={name} name={name} required={required} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
        <option value="">--</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
