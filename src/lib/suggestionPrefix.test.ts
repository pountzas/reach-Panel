import { describe, expect, it } from "vitest";
import {
  shouldClearSuggestions,
  suggestionWordPrefix,
} from "./suggestionPrefix";

describe("suggestionWordPrefix", () => {
  it("returns the current word after the last whitespace", () => {
    expect(suggestionWordPrefix("hello")).toBe("hello");
    expect(suggestionWordPrefix("say hello")).toBe("hello");
    expect(suggestionWordPrefix("hello ")).toBe("");
    expect(suggestionWordPrefix("")).toBe("");
  });
});

describe("shouldClearSuggestions", () => {
  it("clears after space, enter-empty buffer, or short delete prefix", () => {
    expect(shouldClearSuggestions("hello ")).toBe(true);
    expect(shouldClearSuggestions("")).toBe(true);
    expect(shouldClearSuggestions("h")).toBe(true);
    expect(shouldClearSuggestions("he")).toBe(false);
    expect(shouldClearSuggestions("say he")).toBe(false);
  });
});
