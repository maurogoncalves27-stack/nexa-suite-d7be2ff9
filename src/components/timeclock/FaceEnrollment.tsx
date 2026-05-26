import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Camera, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  loadFaceModels,
  detectFaceDescriptor,
  averageDescriptors,
} from "@/lib/faceApi";

const SAMPLES_NEEDED = 3;

interface Props {
  employeeId: string;
  onEnrolled?: () => void;
}

export default function FaceEnrollment({ employeeId, onEnrolled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [samples, setSamples] = useState<Float32Array[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasEnrolled, setHasEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    checkExisting();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const checkExisting = async () => {
    const { data } = await supabase
      .from("employee_face_descriptors")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .maybeSingle();
    setHasEnrolled(!!data);
  };

  const ensureModels = async () => {
    if (modelsReady) return;
    setLoadingModels(true);
    try {
      await loadFaceModels();
      setModelsReady(true);
    } catch (e: any) {
      toast({ title: "Erro ao carregar modelos", description: e.message, variant: "destructive" });
    } finally {
      setLoadingModels(false);
    }
  };

  const startCamera = async () => {
    // Abre a câmera PRIMEIRO (precisa estar dentro do gesto do usuário)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (e: any) {
      toast({ title: "Câmera indisponível", description: e.message ?? "Permita o acesso à câmera nas configurações do navegador.", variant: "destructive" });
      return;
    }
    streamRef.current = stream;
    setCameraOn(true);
    // attach + play após o vídeo entrar no DOM
    setTimeout(async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
    }, 50);
    // Carrega modelos em background
    ensureModels();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const captureSample = async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    try {
      if (!modelsReady) {
        toast({ title: "Aguarde…", description: "Os modelos de IA ainda estão carregando." });
        await ensureModels();
      }
      const desc = await detectFaceDescriptor(videoRef.current);
      if (!desc) {
        toast({ title: "Rosto não detectado", description: "Posicione o rosto centralizado e bem iluminado.", variant: "destructive" });
        return;
      }
      setSamples((s) => [...s, desc]);
      toast({ title: `Amostra ${samples.length + 1} capturada` });
    } catch (e: any) {
      toast({ title: "Erro na detecção", description: e.message, variant: "destructive" });
    } finally {
      setCapturing(false);
    }
  };

  const captureAvatarBlob = async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // crop quadrado central
    const sw = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - sw) / 2;
    const sy = (video.videoHeight - sw) / 2;
    ctx.drawImage(video, sx, sy, sw, sw, 0, 0, size, size);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  };

  const saveEnrollment = async () => {
    if (samples.length < SAMPLES_NEEDED) return;
    setSaving(true);
    try {
      const avg = averageDescriptors(samples);

      // Captura avatar antes de desligar a câmera
      const avatarBlob = await captureAvatarBlob();
      let photo_path: string | null = null;
      if (avatarBlob) {
        const path = `avatars/${employeeId}/avatar.jpg`;
        const { error: upErr } = await supabase.storage
          .from("time-clock-photos")
          .upload(path, avatarBlob, { upsert: true, contentType: "image/jpeg" });
        if (!upErr) photo_path = path;
      }

      // Inativa descritores anteriores
      await supabase
        .from("employee_face_descriptors")
        .update({ is_active: false })
        .eq("employee_id", employeeId)
        .eq("is_active", true);

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_face_descriptors").insert({
        employee_id: employeeId,
        descriptor: avg,
        sample_count: samples.length,
        enrolled_by: user?.id ?? null,
        is_active: true,
        photo_path,
      });
      if (error) throw error;

      toast({ title: "Rosto cadastrado com sucesso!" });
      setSamples([]);
      stopCamera();
      setHasEnrolled(true);
      onEnrolled?.();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (hasEnrolled && !cameraOn) return null;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {!cameraOn ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Camera className={`h-4 w-4 shrink-0 ${hasEnrolled ? "text-primary" : "text-destructive"}`} />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight flex items-center gap-1.5">
                  {hasEnrolled ? "Cadastro Facial" : "Cadastro Facial Necessário"}
                  {hasEnrolled && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </div>
                {!hasEnrolled && (
                  <p className="text-[10px] text-muted-foreground leading-tight">3 amostras p/ ponto</p>
                )}
              </div>
            </div>
            <Button onClick={startCamera} disabled={loadingModels} variant={hasEnrolled ? "outline" : "destructive"} size="sm" className="shrink-0 h-8">
              {loadingModels ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1" />}
              {hasEnrolled ? "Recadastrar" : "Cadastrar"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded-md overflow-hidden bg-muted aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none border-4 border-primary/30 rounded-md" />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Amostras: {samples.length}/{SAMPLES_NEEDED}
                {!modelsReady && <span className="ml-1">(IA…)</span>}
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSamples([])} disabled={samples.length === 0}>
                <RefreshCw className="h-3 w-3 mr-1" /> Reiniciar
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={captureSample} disabled={capturing || samples.length >= SAMPLES_NEEDED} variant="outline" size="sm" className="h-8">
                {capturing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1" />}
                Capturar
              </Button>
              <Button onClick={saveEnrollment} disabled={samples.length < SAMPLES_NEEDED || saving} size="sm" className="h-8">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Salvar
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="w-full h-7" onClick={stopCamera}>
              Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
