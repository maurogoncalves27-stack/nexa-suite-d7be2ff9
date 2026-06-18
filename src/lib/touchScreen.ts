import { isElectron } from "@/lib/electronBridge";

export type TouchKeyboardVariant = "totem" | "pdv";

/** Totem: 23.8" vertical. PDV loja: 21.5" horizontal. */
export function touchKeyboardVariant(): TouchKeyboardVariant {
  if (typeof window === "undefined") return "pdv";
  return window.location.pathname.startsWith("/totem") ? "totem" : "pdv";
}

export function isTouchKeyboardRoute(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (
    path.startsWith("/totem") ||
    path.startsWith("/loja") ||
    path.startsWith("/garcom") ||
    path.startsWith("/smartpos")
  ) {
    return true;
  }
  return isElectron();
}

export function isNumericTouchField(el: HTMLElement): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    if (t === "number" || t === "tel") return true;
    if (el.inputMode === "numeric" || el.inputMode === "decimal") return true;
    if (el.dataset.touchLayout === "numeric") return true;
  }
  return false;
}

/** Atualiza input controlado pelo React via setter nativo + evento input. */
export function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function insertIntoField(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  opts?: { lowercase?: boolean },
) {
  const chunk = opts?.lowercase ? text.toLowerCase() : text;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + chunk + el.value.slice(end);
  setNativeInputValue(el, next);
  const caret = start + chunk.length;
  el.setSelectionRange(caret, caret);
}

export function maskCpfValue(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function appendCpfDigit(current: string, digit: string): string {
  return maskCpfValue(current.replace(/\D/g, "") + digit);
}

export function backspaceCpf(current: string): string {
  return maskCpfValue(current.replace(/\D/g, "").slice(0, -1));
}

export function backspaceField(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start !== end) {
    const next = el.value.slice(0, start) + el.value.slice(end);
    setNativeInputValue(el, next);
    el.setSelectionRange(start, start);
    return;
  }
  if (start <= 0) return;
  const next = el.value.slice(0, start - 1) + el.value.slice(start);
  setNativeInputValue(el, next);
  el.setSelectionRange(start - 1, start - 1);
}
