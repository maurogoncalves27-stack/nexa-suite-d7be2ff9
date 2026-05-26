import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AudioRecorderButtonProps {
  /** Recebe o texto transcrito (já pronto pra anexar ao textarea) */
  onTranscript: (text: string) => void;
  /** Tamanho do botão */
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
  /** Texto curto exibido fora gravando, ex: "Gravar áudio" */
  label?: string;
}

/**
 * Botão de gravação de voz. Grava com MediaRecorder (webm/opus),
 * envia base64 pro edge function `transcribe-audio` e devolve o texto.
 */
export function AudioRecorderButton({
  onTranscript,
  size = "default",
  className,
  disabled,
  label,
}: AudioRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = async () => {
    if (recording || processing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopTracks();
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 800) {
          toast({ title: "Áudio muito curto", description: "Segure e fale por pelo menos 1 segundo." });
          setRecording(false);
          return;
        }
        await transcribe(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: unknown) {
      console.error(e);
      toast({
        title: "Microfone indisponível",
        description: "Permita o acesso ao microfone e tente de novo.",
        variant: "destructive",
      });
    }
  };

  const stop = () => {
    if (!recorderRef.current || !recording) return;
    try {
      recorderRef.current.stop();
    } catch (e) {
      console.error(e);
    }
    setRecording(false);
  };

  const cancel = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = () => {
        stopTracks();
        stopTimer();
      };
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    chunksRef.current = [];
    setRecording(false);
  };

  const transcribe = async (blob: Blob) => {
    setProcessing(true);
    try {
      const buf = await blob.arrayBuffer();
      // base64 sem estourar a stack
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const audio_base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio_base64, mime_type: blob.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text = (data?.text ?? "").toString().trim();
      if (!text) {
        toast({ title: "Não entendi o áudio", description: "Tente falar mais perto do microfone." });
        return;
      }
      onTranscript(text);
      toast({ title: "Áudio transcrito" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao transcrever";
      toast({ title: "Falha na transcrição", description: msg, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (recording) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          type="button"
          size={size}
          variant="destructive"
          onClick={stop}
          className="gap-2 animate-pulse font-semibold"
        >
          <Square className="h-4 w-4 fill-current" />
          Parar ({fmt(elapsed)})
        </Button>
        <Button type="button" size={size} variant="outline" onClick={cancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      onClick={start}
      disabled={disabled || processing}
      className={cn("gap-2", className)}
    >
      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      {processing ? "Transcrevendo..." : label ?? "Falar"}
    </Button>
  );
}
