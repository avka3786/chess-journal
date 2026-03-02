import { describe, it, expect } from "vitest";
import { classifyBucket } from "../lichess";

describe("classifyBucket", () => {
  // STEP1 — Opponent threat / intent missed
  it("classifies 'missed the threat' as STEP1", () => {
    const result = classifyBucket("I totally missed the threat on my knight.");
    expect(result.bucket).toBe("STEP1");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'opponent was threatening' as STEP1", () => {
    const result = classifyBucket("Opponent was threatening a fork and I didn't react.");
    expect(result.bucket).toBe("STEP1");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'left piece hanging' as STEP1", () => {
    const result = classifyBucket("I left my bishop hanging on e4 — piece was hanging.");
    expect(result.bucket).toBe("STEP1");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  // STEP2 — Missed forcing move / miscalculation
  it("classifies 'missed a fork' as STEP2", () => {
    const result = classifyBucket("I missed a fork on d5 that wins the queen.");
    expect(result.bucket).toBe("STEP2");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'miscalculation' as STEP2", () => {
    const result = classifyBucket("Pure miscalculation — I thought I was winning material.");
    expect(result.bucket).toBe("STEP2");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'missed checkmate' as STEP2", () => {
    const result = classifyBucket("Missed checkmate in 2 on move 24.");
    expect(result.bucket).toBe("STEP2");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  // STEP3 — Wrong plan / positional inaccuracy
  it("classifies 'wrong plan' as STEP3", () => {
    const result = classifyBucket("This was the wrong plan — I should have kept the bishop pair.");
    expect(result.bucket).toBe("STEP3");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'pawn structure' as STEP3", () => {
    const result = classifyBucket("Ruined my pawn structure for no compensation.");
    expect(result.bucket).toBe("STEP3");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'prophylaxis' as STEP3", () => {
    const result = classifyBucket("Needed prophylaxis here to prevent the knight outpost.");
    expect(result.bucket).toBe("STEP3");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  // STEP4 — No blunder-check (missed opponent reply)
  it("classifies 'automatic move' as STEP4", () => {
    const result = classifyBucket("Automatic move without considering the reply.");
    expect(result.bucket).toBe("STEP4");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'forgot to check' as STEP4", () => {
    const result = classifyBucket("Forgot to check if my queen was safe after the exchange.");
    expect(result.bucket).toBe("STEP4");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("classifies 'played too fast' as STEP4", () => {
    const result = classifyBucket("Played too fast — didn't think about opponent's options.");
    expect(result.bucket).toBe("STEP4");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  // Priority tie-break: STEP4 > STEP2 > STEP1 > STEP3
  it("STEP4 wins over STEP1 on tie", () => {
    const result = classifyBucket(
      "Played too fast and missed the threat on my king."
    );
    // Both STEP4 ("played too fast") and STEP1 ("missed the threat") match once
    expect(result.bucket).toBe("STEP4");
  });

  // Fallback
  it("falls back to STEP3 with confidence 25 for unrecognised text", () => {
    const result = classifyBucket("Just a bad move overall.");
    expect(result.bucket).toBe("STEP3");
    expect(result.confidence).toBe(25);
  });
});
