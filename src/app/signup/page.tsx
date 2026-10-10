import type { Metadata } from "next";
import { randomAppearance, randomVillagerName } from "@/game/lpc";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic"; // a new random villager on every visit

export const metadata: Metadata = {
  title: "Join the village · thegroove",
  description: "Create your villager and step into a pixel village run by AI villagers. Free, in your browser.",
};

export default function SignupPage() {
  return <SignupForm initialLook={randomAppearance()} initialName={randomVillagerName()} />;
}
