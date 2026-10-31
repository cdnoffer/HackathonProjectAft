import { describe, expect, it } from "bun:test";
import {
  clamp,
  hashString,
  mulberry32,
  randomSeed,
  rngFor,
  shuffled,
} from "../../server/rng";

describe("seeded random utilities", () => {
  it("produces deterministic sequences for the same seed", () => {
    const a = rngFor("scenario", 42, "weather");
    const b = rngFor("scenario", 42, "weather");
    const first = Array.from({ length: 12 }, () => a());
    const second = Array.from({ length: 12 }, () => b());
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it("produces different sequences for different seeds", () => {
    const a = Array.from({ length: 8 }, () => rngFor("a")());
    const b = Array.from({ length: 8 }, () => rngFor("b")());
    expect(a).not.toEqual(b);
  });

  it("hashes deterministically and shuffles without losing items", () => {
    expect(hashString("routey")).toBe(hashString("routey"));
    expect(hashString("routey")).not.toBe(hashString("Routey"));
    const input = [1, 2, 3, 4, 5, 6];
    const output = shuffled(mulberry32(7), input);
    expect([...output].sort((x, y) => x - y)).toEqual(input);
  });

  it("clamps and creates unique-looking seeds", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    const seeds = new Set(Array.from({ length: 30 }, () => randomSeed()));
    expect(seeds.size).toBe(30);
    expect(randomSeed()).toMatch(/^[0-9a-f]{16}$/);
  });
});
