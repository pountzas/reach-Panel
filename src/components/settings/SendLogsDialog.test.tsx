// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { SendLogsDialog } from "./SendLogsDialog";

const surface = getSurfaceColors("#e5e7eb");

function Harness({ onCancel }: { onCancel: () => void }) {
  const [note, setNote] = useState("");
  return (
    <SendLogsDialog
      cancelLabel="Cancel"
      copyIdLabel="Copy"
      destination="Stored for 30 days"
      errorMessage={null}
      files={[{ name: "reach-panel.log", size: 10 }]}
      note={note}
      noteHint="Do not include personal info"
      noteLabel="Note"
      onCancel={onCancel}
      onCopyId={() => undefined}
      onNoteChange={setNote}
      onOpenLogs={() => undefined}
      onSend={() => undefined}
      open
      openLogsLabel="Open logs folder"
      privacyTyped="Typed text is never logged"
      privacyUsername="Your Windows user name is removed"
      reportId={null}
      sendLabel="Send"
      sending={false}
      sendingLabel="Sending"
      successTitle="Sent"
      surface={surface}
      title="Send logs"
    />
  );
}

it("keeps focus in the note field when the cancel callback identity changes", () => {
  const opener = document.createElement("button");
  document.body.appendChild(opener);
  const focus = vi.spyOn(opener, "focus");
  opener.focus();
  const callsAfterOpener = focus.mock.calls.length;

  const { rerender } = render(<Harness onCancel={() => undefined} />);
  const note = screen.getByRole("textbox");
  note.focus();
  fireEvent.change(note, { target: { value: "resized the window" } });
  rerender(<Harness onCancel={() => undefined} />);

  expect(document.activeElement).toBe(note);
  expect(focus.mock.calls.length).toBe(callsAfterOpener);
  opener.remove();
});
