/**
 * Comprime uma imagem no browser antes do upload.
 *
 * Otimizado para celulares com pouca RAM (iOS/Safari principalmente):
 * - Usa createImageBitmap quando disponível (caminho nativo, baixíssimo pico de memória).
 * - Fallback usa URL.createObjectURL + <img>, NUNCA base64/dataURL
 *   (dataURL infla o uso de memória em ~33% e é a causa mais comum
 *   de o navegador matar a aba e voltar pra home).
 * - Libera bitmap, canvas e object URLs imediatamente após o uso.
 * - Reduz a qualidade automaticamente se o arquivo final continuar grande.
 */
export async function compressImage(
  file: File,
  options: { maxDimension?: number; quality?: number; maxBytes?: number } = {},
): Promise<File> {
  const {
    maxDimension = 1280,
    quality = 0.72,
    maxBytes = 1_200_000, // alvo ~1.2 MB
  } = options;

  // Se já é pequeno e não é HEIC/HEIF, retorna como está
  if (file.size <= maxBytes && !/heic|heif/i.test(file.type)) {
    return file;
  }

  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource | null = null;
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  let imgEl: HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        drawSource = bitmap;
      } catch {
        // alguns formatos (ex: HEIC no iOS) podem falhar — cai no fallback
        bitmap = null;
      }
    }

    if (!drawSource) {
      objectUrl = URL.createObjectURL(file);
      imgEl = await loadImage(objectUrl);
      width = imgEl.naturalWidth;
      height = imgEl.naturalHeight;
      drawSource = imgEl;
    }

    if (!width || !height) return file;

    // Calcula novas dimensões mantendo proporção
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(drawSource, 0, 0, width, height);

    // Libera fonte original o quanto antes
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
    bitmap = null;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    imgEl = null;
    drawSource = null;

    let currentQuality = quality;
    let blob = await canvasToBlob(canvas, currentQuality);

    // Se ainda passou do alvo, tenta reduzir qualidade gradualmente
    while (blob && blob.size > maxBytes && currentQuality > 0.4) {
      currentQuality = Math.max(0.4, currentQuality - 0.15);
      blob = await canvasToBlob(canvas, currentQuality);
    }

    // Libera memória do canvas
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) return file;

    const baseName = (file.name || "photo").replace(/\.[^/.]+$/, "");
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.error("compressImage falhou, usando arquivo original:", err);
    return file;
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      try { bitmap.close(); } catch { /* noop */ }
    }
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ }
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.decoding = "async";
    img.src = src;
  });
}
