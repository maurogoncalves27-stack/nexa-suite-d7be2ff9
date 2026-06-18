import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Loader2, CalendarPlus, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Parsed = {
  title: string;
  description: string;
  location: string;
  meeting_url: string;
  start_at: string;
  end_at: string;
  summary: string;
  original_text: string;
};

const speak = (text: string) => {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
};

export default function VoiceAppointmentFAB() {
  const { isAdmin, isManager, isHR } = useAuth();
  const canUse = isAdmin || isManager || isHR;

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [saving, setSaving] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }, []);

  if (!canUse) return null;

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const stopTimer = () => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    if (recording || processing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopTracks(); stopTimer();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 800) {
          toast({ title: "Áudio muito curto", description: "Fale por pelo menos 1 segundo." });
          setRecording(false);
          return;
        }
        await processAudio(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      console.error(e);
      toast({ title: "Microfone indisponível", description: "Permita o acesso ao microfone.", variant: "destructive" });
    }
  };

  const stop = () => {
    if (!recorderRef.current || !recording) return;
    try { recorderRef.current.stop(); } catch (e) { console.error(e); }
    setRecording(false);
  };

  const cancel = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => { stopTracks(); stopTimer(); };
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    chunksRef.current = [];
    setRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    setProcessing(true);
    try {
      // 1) transcrever
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const audio_base64 = btoa(binary);
      const { data: tr, error: trErr } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio_base64, mime_type: blob.type },
      });
      if (trErr) throw trErr;
      const text = (tr?.text ?? "").toString().trim();
      if (!text) {
        toast({ title: "Não entendi o áudio", description: "Tente falar mais perto do microfone." });
        return;
      }

      // 2) interpretar
      const { data: p, error: pErr } = await supabase.functions.invoke("parse-appointment-voice", {
        body: { text },
      });
      if (pErr) throw pErr;
      if (p?.error) throw new Error(p.error);

      const result = p as Parsed;
      if (!result.start_at) {
        toast({ title: "Não consegui identificar data/horário", description: "Tente novamente dizendo dia e hora." });
        return;
      }
      setParsed(result);
      setOpen(true);
      // 3) ler resumo em voz alta
      const phrase = result.summary || `Entendi: ${result.title} em ${result.start_at.replace("T", " às ")}. Confirma?`;
      speak(phrase);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast({ title: "Falha", description: msg, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const save = async () => {
    if (!parsed) return;
    if (!parsed.title.trim() || !parsed.start_at) {
      toast({ title: "Preencha título e início", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("appointments").insert({
        title: parsed.title.trim(),
        description: parsed.description?.trim() || null,
        location: parsed.location?.trim() || null,
        meeting_url: parsed.meeting_url?.trim() || null,
        start_at: new Date(parsed.start_at).toISOString(),
        end_at: parsed.end_at ? new Date(parsed.end_at).toISOString() : null,
        scope: "all",
        reminder_offsets_min: [60, 1440],
        status: "scheduled",
      });
      if (error) throw error;
      toast({ title: "Compromisso agendado", description: parsed.title });
      try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
      setOpen(false);
      setParsed(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast({ title: "Falha ao salvar", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reRecord = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    setOpen(false);
    setParsed(null);
    setTimeout(start, 200);
  };

  const update = <K extends keyof Parsed>(k: K, v: Parsed[K]) => {
    setParsed((p) => (p ? { ...p, [k]: v } : p));
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex flex-col items-end gap-2">
        {recording && (
          <Button size="sm" variant="outline" onClick={cancel} className="shadow-md">
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          onClick={recording ? stop : start}
          disabled={processing}
          className={cn(
            "rounded-full h-14 w-14 p-0 shadow-lg",
            recording ? "bg-destructive hover:bg-destructive/90 animate-pulse" : "bg-primary hover:bg-primary/90",
          )}
          title={recording ? "Parar gravação" : "Agendar compromisso por voz"}
          aria-label="Agendar compromisso por voz"
        >
          {processing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : recording ? (
            <Square className="h-6 w-6 fill-current" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
        {recording && (
          <span className="text-xs bg-background border rounded px-2 py-0.5 shadow">
            Ouvindo… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) try { window.speechSynthesis?.cancel(); } catch { /* noop */ } setOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Confirmar compromisso
            </DialogTitle>
            <DialogDescription>Confira o que entendi. Edite se precisar e salve.</DialogDescription>
          </DialogHeader>
          {parsed && (
            <div className="space-y-3">
              {parsed.summary && (
                <div className="rounded-md bg-muted p-3 text-sm flex items-start gap-2">
                  <Volume2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium">{parsed.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">"{parsed.original_text}"</p>
                  </div>
                </div>
              )}
              <div>
                <Label>Título</Label>
                <Input value={parsed.title} onChange={(e) => update("title", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input type="datetime-local" value={parsed.start_at} onChange={(e) => update("start_at", e.target.value)} />
                </div>
                <div>
                  <Label>Fim (opcional)</Label>
                  <Input type="datetime-local" value={parsed.end_at} onChange={(e) => update("end_at", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Local</Label>
                <Input value={parsed.location} onChange={(e) => update("location", e.target.value)} placeholder="Ex.: Sala da gerência" />
              </div>
              <div>
                <Label>Link da reunião</Label>
                <Input value={parsed.meeting_url} onChange={(e) => update("meeting_url", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={2} value={parsed.description} onChange={(e) => update("description", e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={reRecord} disabled={saving}>
              <Mic className="h-4 w-4 mr-1" /> Regravar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-1" />}
              Salvar compromisso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
