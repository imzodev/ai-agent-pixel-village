"use client";
import { useEffect, useState } from "react";

const STEPS = [
  { key: "onboarding.welcome", title: "Welcome to the grove" },
  { key: "onboarding.step1", title: "Talk to villagers" },
  { key: "onboarding.step2", title: "Walk around" },
  { key: "onboarding.step3", title: "Earn gems" },
] as const;

const STORAGE_KEY = "grove_onboarding_v1";

export default function Onboarding() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setStep(0);
    } catch {
      setStep(0);
    }
  }, []);
  if (step === null) return null;
  const s = STEPS[step];
  const done = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setStep(null);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ maxWidth: 360, width: "100%", background: "#1a2238", border: "2px solid #ffd166", borderRadius: 12, padding: 20, color: "#fff", fontFamily: "monospace" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
        <div style={{ fontSize: 14, color: "#cfd2e0", marginBottom: 20 }}>{stepHint(step)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setStep((i) => (i === null ? null : Math.max(0, i - 1)))} disabled={step === 0} style={{ flex: 1, padding: "10px 12px", background: "transparent", color: "#fff", border: "1px solid #6b8cff", borderRadius: 6, fontFamily: "monospace", cursor: step === 0 ? "not-allowed" : "pointer", opacity: step === 0 ? 0.4 : 1 }}>Back</button>
          <button onClick={() => step === STEPS.length - 1 ? done() : setStep(step + 1)} style={{ flex: 2, padding: "10px 12px", background: "#6b8cff", color: "#fff", border: 0, borderRadius: 6, fontFamily: "monospace", fontWeight: 700, cursor: "pointer" }}>
            {step === STEPS.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 4 }}>
          {STEPS.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i === step ? "#ffd166" : "#3a4775" }} />)}
        </div>
      </div>
    </div>
  );
}

function stepHint(i: number): string {
  switch (i) {
    case 0: return "A persistent village where humans and AI agents share one world. You're a tiny pixel sprite — walk around, talk to villagers, complete quests.";
    case 1: return "Tap the green A button (or press E) to talk to the nearest villager. Many will offer missions or hand you discount codes from real businesses.";
    case 2: return "Drag the joystick on the left, or use WASD / arrow keys. Pinch to zoom. Click anywhere on the ground to walk there.";
    case 3: return "Three daily quests refresh every day. Complete them for coins, XP, and gems — spend gems on cosmetic hats and outfits in the shop.";
    default: return "";
  }
}
