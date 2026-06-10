import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowLeft, MapPin, Briefcase, CalendarClock, CheckCircle2, Sparkles, Upload, FileText, X, Phone, Navigation, ListChecks, Clock, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import "@/styles/aquelaparme.css";
import { useBrandFavicon } from "@/hooks/useBrandFavicon";
import { ApFloatingHeader, ApFooter } from "@/components/public/AquelaParmeChrome";

const AP_FAVICON = "https://aquelaparme.com.br/wp-content/uploads/2026/01/cropped-Icon-Aquela-parme-1-192x192.webp";

function BrandHeader() {
  return <ApFloatingHeader />;
}

interface Job {
  id: string; title: string; position: string; store_id: string | null;
  description: string | null; requirements: string | null; responsibilities: string | null;
  public_image_url: string | null;
  salary_min: number | null; salary_max: number | null; positions_count: number;
}
interface StoreInfo {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}
interface Slot { id: string; start_at: string; duration_min: number; location: string | null; }


const BEHAVIORAL_QUESTIONS = [
  "Por que você quer trabalhar nesta vaga?",
  "Conte uma situação em que você precisou lidar com um cliente difícil.",
  "O que você faz quando comete um erro no trabalho?",
];
const AVAILABILITY_OPTIONS = ["Manhã", "Tarde", "Noite", "Madrugada", "Fins de semana", "Feriados"];

export default function PublicJobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useBrandFavicon(AP_FAVICON);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // form
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", city: "", neighborhood: "",
    birth_date: "", has_transport: "no",
    experience_years: "", last_job: "", last_job_company: "",
    selected_slot_id: "",
  });
  const [availability, setAvailability] = useState<string[]>([]);
  const [behavioral, setBehavioral] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: j } = await supabase.from("job_openings")
        .select("id, title, position, store_id, description, requirements, responsibilities, public_image_url, salary_min, salary_max, positions_count")
        .eq("id", id).eq("is_public", true).eq("status", "open").maybeSingle();
      setJob((j as Job) ?? null);
      if (j) document.title = `${j.title} — Candidate-se`;
      if (j?.store_id) {
        const { data: s } = await supabase.from("stores")
          .select("name, address, city, state, zip_code, phone, latitude, longitude")
          .eq("id", j.store_id).maybeSingle();
        setStoreInfo((s as StoreInfo) ?? null);
      }
      const { data: sl } = await supabase.from("interview_slots")
        .select("id, start_at, duration_min, location")
        .eq("is_available", true)
        .is("booked_by_candidate_id", null)
        .gt("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(60);
      setSlots((sl ?? []) as Slot[]);
      setLoading(false);
    })();
  }, [id]);

  const toggleAvail = (v: string) => setAvailability((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);

  const onResumePick = (f: File | null) => {
    if (!f) { setResumeFile(null); return; }
    // Limites: 8MB, PDF/DOC/DOCX/JPG/PNG
    const validTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"];
    if (!validTypes.includes(f.type)) {
      toast({ title: "Formato não suportado", description: "Envie PDF, DOC, DOCX, JPG ou PNG.", variant: "destructive" });
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Limite de 8MB.", variant: "destructive" });
      return;
    }
    setResumeFile(f);
  };

  const submit = async () => {
    // Validação: todos os campos são obrigatórios
    const missing: string[] = [];
    if (!form.full_name.trim()) missing.push("Nome completo");
    if (!form.phone.trim()) missing.push("Telefone (WhatsApp)");
    if (!form.email.trim()) missing.push("E-mail");
    if (!form.birth_date) missing.push("Data de nascimento");
    if (!form.city.trim()) missing.push("Cidade");
    if (!form.neighborhood.trim()) missing.push("Bairro");
    if (!form.has_transport) missing.push("Transporte próprio");
    if (availability.length === 0) missing.push("Disponibilidade");
    if (!form.experience_years.trim()) missing.push("Anos de experiência");
    if (!form.last_job.trim()) missing.push("Último cargo");
    if (!form.last_job_company.trim()) missing.push("Última empresa");
    for (const q of BEHAVIORAL_QUESTIONS) {
      if (!(behavioral[q] ?? "").trim()) {
        missing.push("Respostas das perguntas comportamentais");
        break;
      }
    }
    if (!resumeFile) missing.push("Currículo");
    if (!form.selected_slot_id) {
      if (slots.length === 0) {
        // sem horários disponíveis: não bloqueia
      } else {
        missing.push("Horário da entrevista");
      }
    }
    // Validação simples de e-mail
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido.", variant: "destructive" });
      return;
    }
    if (missing.length > 0) {
      toast({
        title: "Preencha todos os campos obrigatórios",
        description: missing.join(", "),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);

    // Upload do currículo (obrigatório)
    let resume_path: string | null = null;
    let resume_name: string | null = null;
    if (resumeFile) {
      setUploadingResume(true);
      const ext = resumeFile.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("job-resumes").upload(path, resumeFile, {
        contentType: resumeFile.type, upsert: false,
      });
      setUploadingResume(false);
      if (upErr) {
        setSubmitting(false);
        toast({ title: "Erro ao enviar currículo", description: upErr.message, variant: "destructive" });
        return;
      }
      resume_path = path;
      resume_name = resumeFile.name;
    }

    const { data, error } = await supabase.functions.invoke("screen-job-application", {
      body: {
        job_opening_id: id,
        full_name: form.full_name, email: form.email || null, phone: form.phone,
        city: form.city || null, neighborhood: form.neighborhood || null,
        birth_date: form.birth_date || null,
        has_transport: form.has_transport === "yes",
        availability,
        experience_years: form.experience_years ? Number(form.experience_years) : null,
        last_job: form.last_job || null, last_job_company: form.last_job_company || null,
        behavioral_answers: behavioral,
        selected_slot_id: form.selected_slot_id || null,
        resume_path, resume_name,
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Erro ao enviar", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  if (loading) return (
    <div className="ap-brand min-h-screen">
      <BrandHeader />
      <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ap-red))" }} /></div>
    </div>
  );
  if (!job) return (
    <div className="ap-brand min-h-screen">
      <BrandHeader />
      <div className="max-w-md mx-auto p-8 text-center space-y-3">
        <p className="ap-sans" style={{ color: "hsl(var(--ap-brown))" }}>Vaga não encontrada ou já encerrada.</p>
        <Button asChild><Link to="/vagas"><ArrowLeft className="h-4 w-4 mr-2" />Ver outras vagas</Link></Button>
      </div>
    </div>
  );

  const fullAddress = storeInfo
    ? [storeInfo.address, storeInfo.city, storeInfo.state, storeInfo.zip_code].filter(Boolean).join(", ")
    : "";
  const mapsQuery = storeInfo?.latitude && storeInfo?.longitude
    ? `${storeInfo.latitude},${storeInfo.longitude}`
    : encodeURIComponent(`${storeInfo?.name ?? ""} ${fullAddress}`.trim());
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const selectedSlot = slots.find((s) => s.id === form.selected_slot_id);

  if (done) return (
    <div className="ap-brand min-h-screen">
      <BrandHeader />
      <div className="flex items-center justify-center p-4 py-8">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-6 md:p-8 space-y-5">
          <div className="text-center space-y-2">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Candidatura enviada!</h2>
            <p className="text-muted-foreground">
              Recebemos sua candidatura para <strong>{job.title}</strong>. Em breve você receberá um <strong>e-mail informativo</strong> com os próximos passos do processo.
            </p>
            <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-md p-2 mt-2">
              ⚠️ <strong>Importante:</strong> verifique sua caixa de <strong>spam</strong> ou <strong>lixo eletrônico</strong> caso o e-mail não apareça na caixa de entrada.
            </p>
          </div>

          {/* Guia rápido */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-primary" /> Como será o processo
            </h3>
            <ol className="space-y-2 text-sm text-foreground/90">
              <li className="flex gap-2"><span className="font-semibold text-primary">1.</span> O gestor analisará sua pré-triagem em até 2 dias úteis.</li>
              <li className="flex gap-2"><span className="font-semibold text-primary">2.</span> {selectedSlot
                ? <>Você escolheu o horário <strong>{new Date(selectedSlot.start_at).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</strong>. Confirmaremos pelo WhatsApp.</>
                : <>Entraremos em contato pelo WhatsApp informado para agendar a entrevista.</>}</li>
              <li className="flex gap-2"><span className="font-semibold text-primary">3.</span> Compareça à entrevista no horário combinado, levando documento com foto.</li>
              <li className="flex gap-2"><span className="font-semibold text-primary">4.</span> Se aprovado, você passa por treinamento prático antes da contratação.</li>
            </ol>
          </div>

          {/* Endereço e mapa */}
          {storeInfo && (
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary" /> Onde será a entrevista
              </h3>
              <div className="text-sm space-y-1">
                <p className="font-semibold">{storeInfo.name}</p>
                {fullAddress && <p className="text-muted-foreground">{fullAddress}</p>}
                {storeInfo.phone && (
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {storeInfo.phone}
                  </p>
                )}
              </div>
              <Button asChild size="sm" className="gap-2 w-full sm:w-auto">
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-4 w-4" /> Abrir no Google Maps
                </a>
              </Button>
            </div>
          )}

          {/* Dicas */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> Dicas para a entrevista
            </h3>
            <ul className="text-sm text-foreground/90 space-y-1 list-disc list-inside">
              <li>Chegue com 10 minutos de antecedência.</li>
              <li>Vestimenta neutra e apresentável.</li>
              <li>Leve RG, CPF e currículo impresso (opcional, mas recomendado).</li>
              <li>Tenha em mente exemplos de situações reais que viveu no trabalho.</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/vagas"><ArrowLeft className="h-4 w-4 mr-2" />Ver outras vagas</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
      <ApFooter />
    </div>
  );


  return (
    <div className="ap-brand min-h-screen">
      <BrandHeader />
      <section className="relative overflow-hidden">
        {job.public_image_url && (
          <div className="absolute inset-0">
            <img src={job.public_image_url} alt="" className="w-full h-full object-cover opacity-15" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(var(--ap-cream) / 0.4), hsl(var(--ap-cream)) 90%)" }} />
          </div>
        )}
        <div className="relative max-w-4xl mx-auto px-4 py-10">
          <Link to="/vagas" className="ap-sans inline-flex items-center text-sm mb-4 hover:underline" style={{ color: "hsl(var(--ap-red))" }}>
            <ArrowLeft className="h-4 w-4 mr-1" />Todas as vagas
          </Link>
          <span className="ap-tag mb-3"><Sparkles className="h-3 w-3" /> Vaga aberta</span>
          <h1 className="ap-display text-4xl md:text-5xl mt-3 leading-tight">{job.title}</h1>
          <p className="ap-sans text-lg mt-2" style={{ color: "hsl(var(--ap-brown))" }}>{job.position}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {storeInfo && <span className="ap-tag ap-tag-soft"><MapPin className="h-3 w-3" />{storeInfo.name}</span>}
            <span className="ap-tag ap-tag-soft">{job.positions_count} {job.positions_count === 1 ? "vaga" : "vagas"}</span>
            {job.salary_min && (
              <span className="ap-tag ap-tag-soft">R$ {job.salary_min.toLocaleString("pt-BR")}{job.salary_max ? ` – ${job.salary_max.toLocaleString("pt-BR")}` : "+"}</span>
            )}
          </div>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6 ap-form">
        {storeInfo && (storeInfo.address || storeInfo.city) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" /> Local de trabalho
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-1">
                <p className="font-semibold">{storeInfo.name}</p>
                {fullAddress && <p className="text-muted-foreground">{fullAddress}</p>}
                {storeInfo.phone && (
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {storeInfo.phone}
                  </p>
                )}
              </div>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-4 w-4" /> Ver no Google Maps
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
        {job.description && (
          <Card><CardHeader><CardTitle>Sobre a vaga</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-foreground/90">{job.description}</CardContent>
          </Card>
        )}
        {job.responsibilities && (
          <Card><CardHeader><CardTitle>O que você vai fazer</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-foreground/90">{job.responsibilities}</CardContent>
          </Card>
        )}
        {job.requirements && (
          <Card><CardHeader><CardTitle>O que esperamos</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-foreground/90">{job.requirements}</CardContent>
          </Card>
        )}

        {/* Form */}
        <Card className="ap-card border-2" style={{ borderColor: "hsl(var(--ap-red) / 0.45)" }}>
          <CardHeader>
            <CardTitle className="ap-display text-3xl md:text-4xl flex items-center gap-2" style={{ color: "hsl(var(--ap-red))" }}>
              <Briefcase className="h-6 w-6" style={{ color: "hsl(var(--ap-red))" }} />Candidate-se agora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-3">
              <h3 className="ap-sans font-semibold text-sm uppercase tracking-wide" style={{ color: "hsl(var(--ap-brown))" }}>Seus dados</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nome completo *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Telefone (WhatsApp) *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
                <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Data de nascimento</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Possui transporte próprio?</Label>
                <RadioGroup value={form.has_transport} onValueChange={(v) => setForm({ ...form, has_transport: v })} className="flex gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="t-yes" /><Label htmlFor="t-yes" className="font-normal">Sim</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="no" id="t-no" /><Label htmlFor="t-no" className="font-normal">Não</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Disponibilidade (marque tudo que se aplica)</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <label key={o} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${availability.includes(o) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      <Checkbox checked={availability.includes(o)} onCheckedChange={() => toggleAvail(o)} className="hidden" />
                      <span className="text-sm">{o}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase">Experiência</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Anos de experiência *</Label><Input type="number" min={0} step="0.5" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Último cargo *</Label><Input value={form.last_job} onChange={(e) => setForm({ ...form, last_job: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Última empresa *</Label><Input value={form.last_job_company} onChange={(e) => setForm({ ...form, last_job_company: e.target.value })} /></div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase">Currículo *</h3>
              {resumeFile ? (
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/40">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{resumeFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setResumeFile(null)} className="gap-1">
                    <X className="h-4 w-4" /> Remover
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-md border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique para enviar seu currículo</p>
                  <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, JPG ou PNG · até 8MB</p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => onResumePick(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase">Conte sobre você *</h3>
              {BEHAVIORAL_QUESTIONS.map((q) => (
                <div key={q} className="space-y-1.5">
                  <Label>{q} *</Label>
                  <Textarea rows={2} value={behavioral[q] ?? ""} onChange={(e) => setBehavioral({ ...behavioral, [q]: e.target.value })} />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Escolha um horário para a entrevista *
              </h3>
              {slots.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Sem horários disponíveis no momento. Nosso gestor entrará em contato pelo telefone informado para agendar.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => {
                      const sel = form.selected_slot_id === s.id;
                      const dt = new Date(s.start_at);
                      const day = dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
                      const time = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setForm({ ...form, selected_slot_id: sel ? "" : s.id })}
                          className={`px-3 py-2 rounded-md border text-sm transition-all text-left ${sel ? "bg-primary text-primary-foreground border-primary shadow-md" : "hover:border-primary/50 hover:bg-muted"}`}
                        >
                          <div className="font-semibold capitalize">{day}</div>
                          <div className="text-xs opacity-90">{time}{s.location ? ` · ${s.location}` : ""}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <Button onClick={submit} disabled={submitting} className="w-full h-12 text-base gap-2">
              {(submitting || uploadingResume) && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploadingResume ? "Enviando currículo..." : "Enviar candidatura"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Ao enviar, você concorda com o uso dos seus dados para o processo seletivo.
            </p>
          </CardContent>
        </Card>
      </main>
      <ApFooter />
    </div>
  );
}
