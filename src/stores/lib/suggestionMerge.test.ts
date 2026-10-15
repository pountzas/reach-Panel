import { describe, expect, it, vi } from "vitest";
import {
  commitSuggestionList,
  replaceTrailingWord,
  suggestionSuffixAfterPrefix,
} from "./suggestionMerge";

describe("suggestionSuffixAfterPrefix", () => {
  it("returns the full word when the prefix is empty", () => {
    expect(suggestionSuffixAfterPrefix("hello", "")).toBe("hello");
  });

  it("returns the untyped suffix when the word matches the prefix case-insensitively", () => {
    expect(suggestionSuffixAfterPrefix("Hello", "he")).toBe("llo");
    expect(suggestionSuffixAfterPrefix("HELLO", "hel")).toBe("LO");
  });

  it("returns null when the word does not start with the prefix", () => {
    expect(suggestionSuffixAfterPrefix("hello", "ha")).toBeNull();
  });
});

describe("replaceTrailingWord", () => {
  it("replaces the last token and optionally adds a trailing space", () => {
    expect(replaceTrailingWord("hel", "hello", true)).toBe("hello ");
    expect(replaceTrailingWord("foo hel", "hello", false)).toBe("foo hello");
    expect(replaceTrailingWord("", "hi", true)).toBe("hi ");
  });
});

describe("commitSuggestionList", () => {
  it("sets suggestions via the provided setter", () => {
    const set = vi.fn();
    commitSuggestionList(set, ["hello", "help"]);
    expect(set).toHaveBeenCalledWith({ suggestions: ["hello", "help"] });
  });
});
