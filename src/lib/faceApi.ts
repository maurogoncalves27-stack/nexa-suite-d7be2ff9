import * as faceapi from "face-api.js";

// CDNs em ordem de prioridade — usa o primeiro que responder
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
  "https://justadudewhohacks.github.io/face-api.js/models",
];

const MODEL_LOAD_TIMEOUT_MS = 15000;
const VIDEO_READY_TIMEOUT_MS = 4000;
const DETECTION_TIMEOUT_MS = 8000;

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Tempo limite excedido em ${label}.`));
    }, ms);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      window.clearTimeout(timeoutId);
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("A câmera demorou para ficar pronta. Tente novamente."));
    }, VIDEO_READY_TIMEOUT_MS);

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    onReady();
  });
}

async function tryLoad(url: string): Promise<void> {
  await withTimeout(
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
    ]).then(() => undefined),
    MODEL_LOAD_TIMEOUT_MS,
    `carregamento dos modelos em ${url}`
  );
}

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    let lastErr: any;
    for (const url of MODEL_URLS) {
      try {
        console.log("[faceApi] tentando carregar modelos de:", url);
        await tryLoad(url);
        console.log("[faceApi] modelos carregados com sucesso");
        modelsLoaded = true;
        return;
      } catch (e) {
        console.warn("[faceApi] falha ao carregar de", url, e);
        lastErr = e;
      }
    }
    loadingPromise = null;
    throw new Error(`Falha ao carregar modelos: ${lastErr?.message ?? "rede indisponível"}`);
  })();

  return loadingPromise;
}

export async function detectFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  if (input instanceof HTMLVideoElement) {
    await waitForVideoReady(input);
  }

  const detectionTask = faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  const result = await withTimeout(
    Promise.resolve(detectionTask),
    DETECTION_TIMEOUT_MS,
    "detecção facial"
  );

  return result?.descriptor ?? null;
}

/** Distância euclidiana entre dois descritores (0 = idênticos, 1+ = diferentes) */
export function descriptorDistance(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Threshold padrão do face-api.js: <0.6 = mesma pessoa */
export const FACE_MATCH_THRESHOLD = 0.55;

/** Captura um frame do vídeo como Blob JPEG */
export function captureVideoFrame(video: HTMLVideoElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas não suportado"));
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/jpeg", quality);
  });
}

/** Média de N descritores (usado quando capturamos várias amostras no cadastro) */
export function averageDescriptors(list: Float32Array[]): number[] {
  if (list.length === 0) return [];
  const len = list[0].length;
  const out = new Array(len).fill(0);
  for (const d of list) for (let i = 0; i < len; i++) out[i] += d[i];
  return out.map((v) => v / list.length);
}
