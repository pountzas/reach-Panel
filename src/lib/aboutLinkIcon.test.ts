import { describe, expect, it } from "vitest";
import { ABOUT_LINK_LABEL_KEYS, aboutLinkIconFor } from "./aboutLinkIcon";

describe("aboutLinkIconFor", () => {
  it("lists all seven About link label keys", () => {
    expect(ABOUT_LINK_LABEL_KEYS).toEqual([
      "aboutGitHub",
      "aboutSource",
      "aboutTwitter",
      "aboutLinkedIn",
      "aboutWebsite",
      "aboutDownloads",
      "aboutEmail",
    ]);
  });

  it.each(ABOUT_LINK_LABEL_KEYS)(
    "returns a defined icon component for %s",
    (labelKey) => {
      const Icon = aboutLinkIconFor(labelKey);
      expect(Icon).toBeDefined();
      expect(typeof Icon).toBe("function");
      expect(Icon.name.length).toBeGreaterThan(0);
    },
  );
});
