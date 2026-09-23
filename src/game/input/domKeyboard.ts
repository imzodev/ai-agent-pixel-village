// DOM keyboard adapter for the input router. The only DOM-aware input
// piece; everything else (router, bindings, axis) stays DOM-free.

import type { InputRouter } from "./router";
import { commandFor, normalizeKey } from "./bindings";

type KeyboardLikeEvent = {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
};

/** Attach DOM keyboard listeners that translate events into router commands. */
export function installDomKeyboard(
  router: InputRouter,
  target: { addEventListener: Window["addEventListener"]; removeEventListener: Window["removeEventListener"] } = window,
): () => void {
  const held = new Set<string>();

  function focusTextFocused(): void {
    const t = document.activeElement;
    const focused = !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLElement).isContentEditable));
    router.setTextFocused(focused);
  }

  // True when a text field is currently focused. Used by the keydown/keyup
  // listeners below to skip routing keystrokes that belong to the field.
  function textFocused(): boolean {
    const t = typeof document !== "undefined" ? document.activeElement : null;
    return !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLElement).isContentEditable));
  }

  function onKeyDown(e: KeyboardLikeEvent): void {
    // Never hijack browser/OS shortcuts (Cmd+M, Ctrl+R, Alt+F4, …).
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // When a text field has focus, the keystroke belongs to the field —
    // let it through (so letters, backspace, etc. work) and don't run any
    // game command. The router already gates gameplay-scope commands,
    // but ui-scope (B / Y / M / Esc) was still firing while typing.
    if (textFocused()) return;
    const norm = normalizeKey(e.key);
    if (!norm) return;
    const lookup = commandFor(norm);
    if (!lookup) return;
    if (lookup.mode === "press") {
      // Auto-repeat is meaningless for discrete actions.
      if (e.repeat) return;
      router.trigger(lookup.command);
      // Press keys (E, Space, B, …) shouldn't scroll the page.
      e.preventDefault();
    } else {
      if (!held.has(norm)) {
        held.add(norm);
        router.setHeld(lookup.command, true);
      }
      e.preventDefault();
    }
  }

  function onKeyUp(e: KeyboardLikeEvent): void {
    if (textFocused()) return;
    const norm = normalizeKey(e.key);
    if (!norm) return;
    const lookup = commandFor(norm);
    if (!lookup || lookup.mode !== "hold") return;
    if (held.delete(norm)) router.setHeld(lookup.command, false);
  }

  function onBlur(): void {
    for (const k of held) {
      const lookup = commandFor(k);
      if (lookup) router.setHeld(lookup.command, false);
    }
    held.clear();
    router.setVirtualAxis(0, 0);
  }

  function onFocusIn(): void { focusTextFocused(); }
  function onFocusOut(): void { focusTextFocused(); }

  target.addEventListener("keydown", onKeyDown as unknown as (ev: Event) => void);
  target.addEventListener("keyup", onKeyUp as unknown as (ev: Event) => void);
  target.addEventListener("blur", onBlur as unknown as (ev: Event) => void);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  focusTextFocused();

  return () => {
    target.removeEventListener("keydown", onKeyDown as unknown as (ev: Event) => void);
    target.removeEventListener("keyup", onKeyUp as unknown as (ev: Event) => void);
    target.removeEventListener("blur", onBlur as unknown as (ev: Event) => void);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    held.clear();
  };
}
