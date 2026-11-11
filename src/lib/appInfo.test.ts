import { describe, expect, it } from "vitest";
import { APP_INFO } from "./appInfo";

describe("APP_INFO.links", () => {
  it("exposes the downloads landing URL", () => {
    expect(APP_INFO.links.downloads).toBe(
      "https://reachpanel-companion.vercel.app/",
    );
  });
});
