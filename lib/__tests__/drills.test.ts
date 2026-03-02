import { describe, it, expect } from "vitest";
import { noteToThemes, computeDrills } from "../drills";

describe("noteToThemes", () => {
  it("detects fork keyword", () => {
    const hits = noteToThemes("I missed a fork on d5");
    expect(hits.some((h) => h.themeKey === "FORK")).toBe(true);
    expect(hits.find((h) => h.themeKey === "FORK")!.weight).toBe(3);
  });

  it("detects pin keyword", () => {
    const hits = noteToThemes("The knight was pinned to the king");
    expect(hits.some((h) => h.themeKey === "PIN")).toBe(true);
  });

  it("detects skewer keyword", () => {
    const hits = noteToThemes("Should have played a skewer move");
    expect(hits.some((h) => h.themeKey === "SKEWER")).toBe(true);
  });

  it("detects blunder → DEFENSIVE_MOVE with weight 3", () => {
    const hits = noteToThemes("I blundered my queen here");
    const dm = hits.find((h) => h.themeKey === "DEFENSIVE_MOVE");
    expect(dm).toBeDefined();
    expect(dm!.weight).toBe(3);
  });

  it("detects blunder → also adds MATE_IN_1 with weight 2", () => {
    const hits = noteToThemes("Complete blunder, dropped my rook");
    expect(hits.some((h) => h.themeKey === "MATE_IN_1")).toBe(true);
    expect(hits.find((h) => h.themeKey === "MATE_IN_1")!.weight).toBe(2);
  });

  it("detects hung → blunder group + HANGING_PIECE", () => {
    const hits = noteToThemes("I hung my bishop on e4");
    expect(hits.some((h) => h.themeKey === "DEFENSIVE_MOVE")).toBe(true);
    expect(hits.some((h) => h.themeKey === "HANGING_PIECE")).toBe(true);
  });

  it("detects back rank", () => {
    const hits = noteToThemes("Missed a back rank checkmate");
    expect(hits.some((h) => h.themeKey === "BACK_RANK_MATE")).toBe(true);
  });

  it("detects zwischenzug → INTERMEZZO", () => {
    const hits = noteToThemes("Could play a zwischenzug before recapturing");
    expect(hits.some((h) => h.themeKey === "INTERMEZZO")).toBe(true);
  });

  it("detects deflection keyword", () => {
    const hits = noteToThemes("Missed a deflection of the rook");
    expect(hits.some((h) => h.themeKey === "DEFLECTION")).toBe(true);
  });

  it("uses bucket fallback STEP1 when no keywords match", () => {
    const hits = noteToThemes("Played a bad move here", "STEP1");
    expect(hits.some((h) => h.themeKey === "DEFENSIVE_MOVE")).toBe(true);
    expect(hits[0].reason).toBe("bucket:STEP1");
  });

  it("uses bucket fallback STEP3 → QUIET_MOVE", () => {
    const hits = noteToThemes("Wrong plan in this position", "STEP3");
    expect(hits.some((h) => h.themeKey === "QUIET_MOVE")).toBe(true);
    expect(hits[0].reason).toBe("bucket:STEP3");
  });

  it("uses bucket fallback STEP4 → DEFENSIVE_MOVE + MATE_IN_2", () => {
    const hits = noteToThemes("Rushed this move", "STEP4");
    const keys = hits.map((h) => h.themeKey);
    expect(keys).toContain("DEFENSIVE_MOVE");
    expect(keys).toContain("MATE_IN_2");
  });

  it("returns empty array when note is empty and no bucket given", () => {
    const hits = noteToThemes("");
    expect(hits).toHaveLength(0);
  });
});

describe("computeDrills", () => {
  it("returns [null, null] when annotations and findings are empty", () => {
    const [d1, d2] = computeDrills([], []);
    expect(d1).toBeNull();
    expect(d2).toBeNull();
  });

  it("drill1 is null when only findings are provided", () => {
    const findings = [{ motif: "FORK", swingCp: -200 }];
    const [d1] = computeDrills([], findings);
    expect(d1).toBeNull();
  });

  it("drill1 picks highest-weight theme from annotations", () => {
    const anns = [
      { note: "I forked the king and rook", bucket: "STEP2" },
      { note: "Another fork here too", bucket: "STEP2" },
      { note: "Pinned piece", bucket: "STEP2" },
    ];
    const [d1] = computeDrills(anns, []);
    expect(d1?.motif).toBe("FORK");
  });

  it("drill1 includes lichess URL and label from MOTIF_META", () => {
    const [d1] = computeDrills([{ note: "missed a fork", bucket: null }], []);
    expect(d1?.lichessUrl).toContain("lichess.org");
    expect(d1?.label).toBe("Fork");
  });

  it("drill2 picks top finding motif that differs from drill1", () => {
    const anns = [{ note: "missed a fork", bucket: null }];
    const findings = [
      { motif: "FORK", swingCp: -200 },
      { motif: "PIN",  swingCp: -300 },
    ];
    const [d1, d2] = computeDrills(anns, findings);
    expect(d1?.motif).toBe("FORK");
    expect(d2?.motif).toBe("PIN");
  });

  it("drill2 is null when all findings have same motif as drill1", () => {
    const anns = [{ note: "missed a fork", bucket: null }];
    const findings = [
      { motif: "FORK", swingCp: -200 },
      { motif: "FORK", swingCp: -150 },
    ];
    const [, d2] = computeDrills(anns, findings);
    expect(d2).toBeNull();
  });

  it("drill2 ranks findings by score = count + totalSwing/300", () => {
    const findings = [
      { motif: "PIN",  swingCp: -100 }, // score ≈ 1 + 100/300 ≈ 1.33
      { motif: "FORK", swingCp: -600 }, // score ≈ 1 + 600/300 = 3
    ];
    const [, d2] = computeDrills([], findings);
    expect(d2?.motif).toBe("FORK");
  });
});
