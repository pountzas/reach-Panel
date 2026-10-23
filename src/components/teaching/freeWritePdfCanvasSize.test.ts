import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFreeWritePdfCanvasSize } from "./freeWritePdfCanvasSize";

const here = dirname(fileURLToPath(import.meta.url));
const paneSource = readFileSync(join(here, "FreeWritePdfPane.tsx"), "utf8");

describe("computeFreeWritePdfCanvasSize", () => {
  it("uses viewport × DPR for the buffer and CSS size equal to the viewport", () => {
    const size = computeFreeWritePdfCanvasSize(800, 600, 1.25);
    expect(size.cssWidth).toBe(800);
    expect(size.cssHeight).toBe(600);
    expect(size.outputScale).toBe(1.25);
    expect(size.bufferWidth).toBe(1000);
    expect(size.bufferHeight).toBe(750);
  });

  it("keeps CSS at the viewport for 150% scaling", () => {
    const size = computeFreeWritePdfCanvasSize(612, 792, 1.5);
    expect(size.cssWidth).toBe(612);
    expect(size.cssHeight).toBe(792);
    expect(size.bufferWidth).toBe(918);
    expect(size.bufferHeight).toBe(1188);
  });

  it("treats missing or sub-1 DPR as 1 so 100% scaling stays 1:1", () => {
    expect(computeFreeWritePdfCanvasSize(100, 200, 0).outputScale).toBe(1);
    expect(computeFreeWritePdfCanvasSize(100, 200, 0).bufferWidth).toBe(100);
    expect(computeFreeWritePdfCanvasSize(100, 200, 1).bufferHeight).toBe(200);
  });
});

describe("FreeWritePdfPane load contract", () => {
  it("loads PDF bytes without base64", () => {
    expect(paneSource).not.toMatch(/base64ToUint8Array/);
    expect(paneSource).not.toMatch(/contentBase64/);
    expect(paneSource).toMatch(
      /invoke<ArrayBuffer>\(\s*"cmd_read_teaching_pdf"/,
    );
  });
});
