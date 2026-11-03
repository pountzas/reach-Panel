// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { logError } = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock("../../lib/log", () => ({
  logError,
}));

import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("child render failed");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    logError.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("logs a render error with the component stack", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(logError).toHaveBeenCalledWith(
      "react",
      "Render error",
      expect.objectContaining({
        error: expect.objectContaining({ message: "child render failed" }),
        componentStack: expect.stringMatching(/Boom/),
      }),
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("reloads the window when Reload is pressed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
