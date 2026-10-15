import { describe, expect, it } from "vitest";
import {
  isReachPdfPath,
  toOriginalPdfPath,
  toReachPdfPath,
} from "./reachPdfPath";

describe("reachPdfPath", () => {
  it("detects .reach.pdf case-insensitively", () => {
    expect(isReachPdfPath("C:\\a\\doc.reach.pdf")).toBe(true);
    expect(isReachPdfPath("C:\\a\\doc.REACH.PDF")).toBe(true);
    expect(isReachPdfPath("C:\\a\\doc.pdf")).toBe(false);
  });

  it("maps original to sibling", () => {
    expect(toReachPdfPath("C:\\Books\\ws.pdf")).toBe("C:\\Books\\ws.reach.pdf");
    expect(toReachPdfPath("C:\\Books\\ws.reach.pdf")).toBe(
      "C:\\Books\\ws.reach.pdf",
    );
  });

  it("maps sibling back to original", () => {
    expect(toOriginalPdfPath("C:\\Books\\ws.reach.pdf")).toBe(
      "C:\\Books\\ws.pdf",
    );
    expect(toOriginalPdfPath("C:\\Books\\ws.pdf")).toBe("C:\\Books\\ws.pdf");
  });
});
