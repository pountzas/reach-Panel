import { describe, expect, it } from "vitest";
import { APP_INFO, GROQ_API_KEYS_URL } from "./appInfo";

describe("APP_INFO.links", () => {
  it("exposes the downloads landing URL", () => {
    expect(APP_INFO.links.downloads).toBe(
      "https://reachpanel-companion.vercel.app/",
    );
  });
});

describe("GROQ_API_KEYS_URL", () => {
  it("points to the Groq console keys page", () => {
    expect(GROQ_API_KEYS_URL).toBe("https://console.groq.com/keys");
  });
});
