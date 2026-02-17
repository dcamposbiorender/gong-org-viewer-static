import { describe, it, expect } from "vitest";
import { buildSpeakerMap, resolveSpeakers } from "./speaker-resolution";

describe("buildSpeakerMap", () => {
  it("returns empty map when no speakerId", () => {
    const result = buildSpeakerMap("[Speaker 1] hello", { quote: "hello" });
    expect(result).toEqual({});
  });

  it("returns empty map when fewer than 2 speakers", () => {
    const result = buildSpeakerMap("[Speaker 1] hello", {
      quote: "hello",
      speakerId: "1",
    });
    expect(result).toEqual({});
  });

  it("maps two speakers correctly using speakerId as customer", () => {
    const context =
      "[Speaker 1] How big is the team? [Speaker 2] About 50 people.";
    const snippet = {
      quote: "About 50 people.",
      speakerId: "2",
      customerName: "John Smith",
      internalName: "Alice Johnson",
    };
    const map = buildSpeakerMap(context, snippet);
    // speakerId 2 said the quote, so should be customer
    expect(Object.keys(map)).toHaveLength(2);
    expect(map).toHaveProperty("1");
    expect(map).toHaveProperty("2");
  });

  it("resolves quote speaker correctly when nearest marker differs", () => {
    const context =
      "[Speaker 1] I run the oncology team. [Speaker 2] How big is it? [Speaker 1] About 50 people.";
    const snippet = {
      quote: "About 50 people.",
      speakerId: "1",
      customerName: "Customer Name",
      internalName: "Rep Name",
    };
    const map = buildSpeakerMap(context, snippet);
    // Speaker 1 is nearest to quote, matches speakerId → customer
    expect(map["1"]).toBe("Customer Name");
    expect(map["2"]).toBe("Rep Name");
  });

  it("takes first name from semicolon-delimited list", () => {
    const context = "[Speaker 1] hi [Speaker 2] hello there";
    const snippet = {
      quote: "hello there",
      speakerId: "2",
      customerName: "Jane Doe; Bob Smith",
      internalName: "Alice; Carol",
    };
    const map = buildSpeakerMap(context, snippet);
    expect(map["2"]).toBe("Jane Doe");
    expect(map["1"]).toBe("Alice");
  });

  it("uses defaults for missing names", () => {
    const context = "[Speaker 1] text [Speaker 2] more text";
    const snippet = {
      quote: "more text",
      speakerId: "2",
    };
    const map = buildSpeakerMap(context, snippet);
    expect(map["2"]).toBe("Customer");
    expect(map["1"]).toBe("BioRender Rep");
  });

  it("returns empty map for more than 2 speakers", () => {
    const context = "[Speaker 1] a [Speaker 2] b [Speaker 3] c";
    const snippet = {
      quote: "b",
      speakerId: "2",
      customerName: "Cust",
      internalName: "Rep",
    };
    const map = buildSpeakerMap(context, snippet);
    expect(map).toEqual({});
  });
});

describe("resolveSpeakers", () => {
  it("replaces known speaker IDs with names", () => {
    const text = "[Speaker 1] said hello [Speaker 2] replied";
    const map = { "1": "Alice", "2": "Bob" };
    const result = resolveSpeakers(text, map);
    expect(result).toBe("[Alice] said hello [Bob] replied");
  });

  it("labels unknown speakers as A, B, C...", () => {
    const text = "[Speaker 5] spoke then [Speaker 9] replied";
    const result = resolveSpeakers(text, {});
    expect(result).toBe("[Speaker A] spoke then [Speaker B] replied");
  });

  it("handles mixed known and unknown speakers", () => {
    const text = "[Speaker 1] intro [Speaker 3] and [Speaker 7] end";
    const map = { "1": "Alice" };
    const result = resolveSpeakers(text, map);
    expect(result).toBe("[Alice] intro [Speaker A] and [Speaker B] end");
  });
});
