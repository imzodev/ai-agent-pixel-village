// DOM keyboard adapter for the input router. The only DOM-aware input
// piece; everything else (router, bindings, axis) stays DOM-free.

import type { InputRouter } from "./router";
import { normalizeKey } from "./bindings";

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

  // True for keys that should pass through to the active text field
  // rather than being captured by the game (letters, digits, space, etc.).
  // Escape and Enter are explicitly NOT typeable: dialogs need them
  // even while a text field has focus.
  function isTypeable(key: string): boolean {
    if (key === "Enter" || key === "Escape" || key === "Tab") return false;
    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") return false;
    return true;
  }

  function onKeyDown(e: KeyboardLikeEvent): void {
    // Never hijack browser/OS shortcuts (Cmd+M, Ctrl+R, Alt+F4, …).
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // When a text field has focus, only "typeable" keys belong to the
    // field; system keys (Esc/Enter/arrows) fall through to the router
    // so modals can still close on Esc and form-style flows can fire on
    // Enter.
    if (textFocused() && isTypeable(e.key)) return;
    const norm = normalizeKey(e.key);
    if (!norm) return;
    // Modal keymaps take priority over global bindings. If a modal is
    // open and a key is unmapped in the modal layer, the router returns
    // null and we drop the event.
    const lookup = router.lookup(norm);
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
    if (textFocused() && isTypeable(e.key)) return;
    const norm = normalizeKey(e.key);
    if (!norm) return;
    const lookup = router.lookup(norm);
    if (!lookup || lookup.mode !== "hold") return;
    if (held.delete(norm)) router.setHeld(lookup.command, false);
  }

  function onBlur(): void {
    for (const k of held) {
      const lookup = router.lookup(k);
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
