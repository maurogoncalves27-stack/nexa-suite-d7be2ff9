import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { VirtualKeyboard } from "@/components/touch/VirtualKeyboard";
import {
  appendCpfDigit,
  backspaceCpf,
  backspaceField,
  insertIntoField,
  isNumericTouchField,
  isTouchKeyboardRoute,
  setNativeInputValue,
  type TouchKeyboardVariant,
} from "@/lib/touchScreen";

interface Props {
  children: ReactNode;
  variant?: TouchKeyboardVariant;
}

function isEditableField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.dataset.noTouchKeyboard === "true") return false;
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    if (t === "hidden" || t === "checkbox" || t === "radio" || t === "file" || t === "button" || t === "submit") {
      return false;
    }
  }
  return true;
}

export function TouchKeyboardProvider({ children, variant = "pdv" }: Props) {
  const enabled = isTouchKeyboardRoute();
  const [active, setActive] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [visible, setVisible] = useState(false);

  const layout = useMemo(() => {
    if (!active) return "qwerty" as const;
    return isNumericTouchField(active) ? ("numeric" as const) : ("qwerty" as const);
  }, [active]);

  useEffect(() => {
    if (!enabled) return;

    const onFocusIn = (ev: FocusEvent) => {
      if (!isEditableField(ev.target)) return;
      setActive(ev.target);
      setVisible(true);
    };

    const onFocusOut = (ev: FocusEvent) => {
      const related = ev.relatedTarget as Node | null;
      if (related && (related as HTMLElement).closest?.("[data-touch-keyboard-root]")) return;
      window.setTimeout(() => {
        const focused = document.activeElement;
        if (focused && (focused as HTMLElement).closest?.("[data-touch-keyboard-root]")) return;
        if (!isEditableField(focused)) {
          setVisible(false);
          setActive(null);
        }
      }, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled]);

  const onKey = useCallback(
    (k: string) => {
      if (!active) return;
      if (active.dataset.touchMask === "cpf") {
        setNativeInputValue(active, appendCpfDigit(active.value, k));
        return;
      }
      insertIntoField(active, k, { lowercase: layout === "qwerty" && active.dataset.touchLowercase === "true" });
    },
    [active, layout],
  );

  const onBackspace = useCallback(() => {
    if (!active) return;
    if (active.dataset.touchMask === "cpf") {
      setNativeInputValue(active, backspaceCpf(active.value));
      return;
    }
    backspaceField(active);
  }, [active]);

  const onSpace = useCallback(() => {
    if (!active || layout !== "qwerty") return;
    insertIntoField(active, " ");
  }, [active, layout]);

  const onEnter = useCallback(() => {
    setVisible(false);
    active?.blur();
  }, [active]);

  if (!enabled) return <>{children}</>;

  return (
    <>
      <div className={visible ? "pb-[min(42vh,360px)]" : undefined}>{children}</div>
      {visible && active && (
        <div
          data-touch-keyboard-root
          className="fixed inset-x-0 bottom-0 z-[200] max-h-[42vh] overflow-y-auto"
        >
          <VirtualKeyboard
            variant={variant}
            layout={layout}
            onKey={onKey}
            onBackspace={onBackspace}
            onSpace={layout === "qwerty" ? onSpace : undefined}
            onEnter={onEnter}
            onDismiss={() => {
              setVisible(false);
              active.blur();
            }}
          />
        </div>
      )}
    </>
  );
}
