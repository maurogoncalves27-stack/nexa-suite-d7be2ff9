import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURL: (type?: string) => string;
}

interface Props {
  height?: number;
  penColor?: string;
  className?: string;
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 160, penColor = "#111827", className = "" },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const emptyRef = useRef(true);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const fillWhite = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  };

  const applyStyle = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.fillStyle = penColor;
    ctx.lineWidth = 2.2;
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => emptyRef.current,
    clear: () => {
      fillWhite();
      applyStyle();
      emptyRef.current = true;
    },
    toDataURL: (type = "image/png") => canvasRef.current?.toDataURL(type) ?? "",
  }));

  // Setup canvas + listeners nativos (mais confiáveis dentro de Radix Dialog)
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const setupSize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      // se nada mudou, não recria (evita apagar desenho durante animações)
      if (sizeRef.current.w === w && sizeRef.current.h === h && sizeRef.current.dpr === dpr) {
        return;
      }
      const prev = emptyRef.current ? null : canvas.toDataURL();
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fillWhite();
      applyStyle();
      if (prev) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
        img.src = prev;
      }
    };

    setupSize();
    // Tenta novamente após o dialog terminar a animação
    const t = window.setTimeout(setupSize, 200);

    let roFrame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roFrame);
      roFrame = requestAnimationFrame(setupSize);
    });
    ro.observe(wrap);

    const getPos = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    const start = (clientX: number, clientY: number) => {
      drawingRef.current = true;
      const p = getPos(clientX, clientY);
      lastPointRef.current = p;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      emptyRef.current = false;
    };

    const move = (clientX: number, clientY: number) => {
      if (!drawingRef.current) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const p = getPos(clientX, clientY);
      const last = lastPointRef.current ?? p;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPointRef.current = p;
      emptyRef.current = false;
    };

    const end = () => {
      drawingRef.current = false;
      lastPointRef.current = null;
    };

    // Mouse
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      start(e.clientX, e.clientY);
      // listeners no window para continuar desenhando fora do canvas
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      move(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      end();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    // Touch
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.touches[0];
      start(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      end();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penColor]);

  return (
    <div
      ref={wrapRef}
      className={`rounded-md border bg-white overflow-hidden w-full ${className}`}
      style={{ height, maxWidth: "100%", contain: "size layout paint" }}
    >
      <canvas
        ref={canvasRef}
        className="block select-none"
        style={{ display: "block", maxWidth: "100%", cursor: "crosshair", touchAction: "none" }}
      />
    </div>
  );
});

export default SignaturePad;
