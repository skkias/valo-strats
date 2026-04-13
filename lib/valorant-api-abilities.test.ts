import { describe, expect, it } from "vitest";
import {
  abilityMetaForSlot,
  type ValorantAbilityUiMeta,
  valorantDisplayNameToSlug,
} from "@/lib/valorant-api-abilities";

describe("valorantDisplayNameToSlug", () => {
  it("normalizes punctuation and casing", () => {
    expect(valorantDisplayNameToSlug("KAY/O")).toBe("kayo");
    expect(valorantDisplayNameToSlug("Brimstone")).toBe("brimstone");
    expect(valorantDisplayNameToSlug("Deadlock!")).toBe("deadlock");
  });
});

describe("abilityMetaForSlot", () => {
  it("finds slot metadata for an agent slug", () => {
    const bySlug: Record<string, ValorantAbilityUiMeta[]> = {
      jett: [
        { slot: "q", displayName: "Updraft", description: "Lift", displayIcon: null },
        { slot: "e", displayName: "Tailwind", description: "Dash", displayIcon: null },
      ],
    };

    expect(abilityMetaForSlot(bySlug, "jett", "e")?.displayName).toBe("Tailwind");
    expect(abilityMetaForSlot(bySlug, "jett", "x")).toBeUndefined();
    expect(abilityMetaForSlot(bySlug, "sage", "e")).toBeUndefined();
  });
});
