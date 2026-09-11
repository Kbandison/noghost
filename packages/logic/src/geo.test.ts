import { describe, expect, it } from "vitest";
import {
  distanceKm,
  distanceLabel,
  isUsablePoint,
  placeLabel,
  proximityScore,
  roundForStorage,
  withinReach,
} from "./geo";

// Real places, so a wrong formula is obvious rather than self-consistent.
const MIDTOWN = { lat: 33.7815, lng: -84.3835 };      // Atlanta
const DECATUR = { lat: 33.7748, lng: -84.2963 };      // ~8km east
const MARIETTA = { lat: 33.9526, lng: -84.5499 };     // ~28km northwest
const NASHVILLE = { lat: 36.1627, lng: -86.7816 };    // ~340km
const LISBON = { lat: 38.7223, lng: -9.1393 };

describe("distance", () => {
  it("matches known separations", () => {
    expect(distanceKm(MIDTOWN, DECATUR)).toBeGreaterThan(7);
    expect(distanceKm(MIDTOWN, DECATUR)).toBeLessThan(9);
    expect(distanceKm(MIDTOWN, MARIETTA)).toBeGreaterThan(24);
    expect(distanceKm(MIDTOWN, MARIETTA)).toBeLessThan(32);
    expect(Math.round(distanceKm(MIDTOWN, NASHVILLE))).toBeGreaterThan(300);
  });

  it("is zero for the same point and symmetric", () => {
    expect(distanceKm(MIDTOWN, MIDTOWN)).toBe(0);
    expect(distanceKm(MIDTOWN, LISBON)).toBeCloseTo(distanceKm(LISBON, MIDTOWN), 6);
  });

  it("does not fall apart across the date line", () => {
    // A flat approximation reports half the planet here. Two points 2° apart
    // either side of the antimeridian are a couple of hundred kilometres.
    const east = { lat: 0, lng: 179 };
    const west = { lat: 0, lng: -179 };
    expect(distanceKm(east, west)).toBeLessThan(250);
  });
});

describe("both people have to be willing", () => {
  it("uses the smaller radius, so neither is overruled", () => {
    // Decatur is ~8km from Midtown. One will travel 25km, the other only 5.
    expect(withinReach(MIDTOWN, 25, DECATUR, 5)).toBe(false);
    expect(withinReach(MIDTOWN, 25, DECATUR, 10)).toBe(true);
    // And it does not matter which way round they are asked.
    expect(withinReach(DECATUR, 5, MIDTOWN, 25)).toBe(false);
  });
});

describe("proximity as score", () => {
  it("grades rather than switching, which is what the cluster rule got wrong", () => {
    // The old +3 was all-or-nothing on a boundary: half a mile apart across a
    // line scored zero, nine miles apart inside one scored full marks.
    expect(proximityScore(MIDTOWN, MIDTOWN)).toBe(3);
    expect(proximityScore(MIDTOWN, DECATUR)).toBe(2);
    expect(proximityScore(MIDTOWN, MARIETTA)).toBe(1);
    expect(proximityScore(MIDTOWN, NASHVILLE)).toBe(0);
  });

  it("scores nothing rather than guessing when a point is missing", () => {
    expect(proximityScore(null, MIDTOWN)).toBe(0);
    expect(proximityScore(MIDTOWN, null)).toBe(0);
  });
});

describe("what a member is shown", () => {
  it("is a bucket, never a number somebody could triangulate on", () => {
    expect(distanceLabel(MIDTOWN, MIDTOWN)).toBe("Just around the corner");
    expect(distanceLabel(MIDTOWN, DECATUR)).toBe("Across town");
    expect(distanceLabel(MIDTOWN, NASHVILLE)).toBe("Worth the trip");
    // No digits at all — a label that leaks a radius is a circle to stand on.
    for (const label of [distanceLabel(MIDTOWN, DECATUR), distanceLabel(MIDTOWN, MARIETTA)]) {
      expect(label).not.toMatch(/\d/);
    }
  });
});

describe("what gets stored", () => {
  it("is rounded before it ever reaches the database", () => {
    const precise = { lat: 33.78151234, lng: -84.38359876 };
    expect(roundForStorage(precise)).toEqual({ lat: 33.782, lng: -84.384 });
  });

  it("keeps enough precision for every decision the product makes", () => {
    // Rounding must not move somebody into a different proximity bucket.
    const a = roundForStorage({ lat: 33.78151234, lng: -84.38359876 });
    const b = roundForStorage({ lat: 33.77481111, lng: -84.29632222 });
    expect(proximityScore(a, b)).toBe(proximityScore(MIDTOWN, DECATUR));
  });

  it("refuses what a failed geocode looks like", () => {
    expect(isUsablePoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isUsablePoint(null)).toBe(false);
    expect(isUsablePoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isUsablePoint({ lat: NaN, lng: 1 })).toBe(false);
    expect(isUsablePoint(MIDTOWN)).toBe(true);
    expect(isUsablePoint(LISBON)).toBe(true);
  });
});

describe("placeLabel — a place, never an address", () => {
  it("composes a city and state rather than trusting the title", () => {
    // The exact response `30308` came back with from the live API. The title
    // names a building; the label must not.
    const label = placeLabel(
      {
        title: "30308, U-Rescue Villa, Atlanta, GA, United States",
        locality: "Atlanta",
        regionCode: "GA",
        regionName: "Georgia",
        country: "United States",
      },
      "30308",
    );
    expect(label).toBe("Atlanta, GA");
    expect(label).not.toContain("U-Rescue Villa");
    expect(label).not.toContain("30308");
  });

  it("never leaks a building name, whatever the title says", () => {
    const titles = [
      "30308, U-Rescue Villa, Atlanta, GA, United States",
      "221B Baker Street, Marylebone, London, England, United Kingdom",
      "Apartment 4, 12 Rua Garrett, Lisboa, Portugal",
    ];
    for (const title of titles) {
      const label = placeLabel({ title, locality: "Somewhere", regionCode: "XX" }, "typed");
      expect(label).toBe("Somewhere, XX");
    }
  });

  it("prefers a short region code to a long region name", () => {
    expect(placeLabel({ locality: "Atlanta", regionCode: "GA", regionName: "Georgia" }, "x"))
      .toBe("Atlanta, GA");
    // Some regions report their full name in the code field; a code is only a
    // code when it is short.
    expect(
      placeLabel(
        { locality: "Lisbon", regionCode: "Lisboa Metropolitan Area", regionName: "Lisboa" },
        "x",
      ),
    ).toBe("Lisbon, Lisboa");
  });

  it("falls back to the country when there is no region", () => {
    expect(placeLabel({ locality: "Lisbon", country: "Portugal" }, "x")).toBe("Lisbon, Portugal");
  });

  it("uses the sub-region when there is no locality", () => {
    expect(placeLabel({ subRegion: "DeKalb County", regionCode: "GA" }, "x"))
      .toBe("DeKalb County, GA");
  });

  it("trims the title to its tail when there is nothing else — never its head", () => {
    // The head is the specific end. "30308, U-Rescue Villa, ..." must not
    // survive as "30308, U-Rescue Villa".
    expect(placeLabel({ title: "30308, U-Rescue Villa, Atlanta, GA, United States" }, "30308"))
      .toBe("GA, United States");
  });

  it("gives back what they typed rather than nothing at all", () => {
    expect(placeLabel({}, "30308")).toBe("30308");
    expect(placeLabel({ title: "  ", locality: "  " }, "Lisbon")).toBe("Lisbon");
  });
});
