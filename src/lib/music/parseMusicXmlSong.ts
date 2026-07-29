import JSZip from "jszip";
import {
  buildImportedSong,
  bytesFromBase64,
  onsetsToNoteEvents,
  pickDensestMonophonicTrack,
  textFromBase64,
  type ImportedMusicSong,
  type MusicTrackCandidate,
} from "./importTypes";

const ALTER_TO_ACCIDENTAL: Record<number, string> = {
  [-1]: "b",
  0: "",
  1: "#",
};

function musicXmlPitch(step: string, alter: number, octave: number): string | null {
  const accidental = ALTER_TO_ACCIDENTAL[alter] ?? (alter > 0 ? "#" : alter < 0 ? "b" : "");
  const flattened = flattenToSharp(`${step}${accidental}`);
  if (!flattened) return null;
  return `${flattened}${octave}`;
}

function flattenToSharp(note: string): string | null {
  const map: Record<string, string> = {
    C: "C",
    "C#": "C#",
    Db: "C#",
    D: "D",
    "D#": "D#",
    Eb: "D#",
    E: "E",
    Fb: "E",
    "E#": "F",
    F: "F",
    "F#": "F#",
    Gb: "F#",
    G: "G",
    "G#": "G#",
    Ab: "G#",
    A: "A",
    "A#": "A#",
    Bb: "A#",
    B: "B",
    Cb: "B",
    "B#": "C",
  };
  return map[note] ?? null;
}

function textContent(el: Element | null, name: string): string {
  return el?.getElementsByTagName(name)[0]?.textContent?.trim() ?? "";
}

function parsePartNotes(part: Element): {
  events: Array<{ onsetBeats: number; durationBeats: number; pitch: string }>;
  tempoBpm: number | null;
} {
  let divisions = 1;
  let onset = 0;
  let tempoBpm: number | null = null;
  const events: Array<{ onsetBeats: number; durationBeats: number; pitch: string }> = [];

  const measures = Array.from(part.getElementsByTagName("measure"));
  for (const measure of measures) {
    for (const child of Array.from(measure.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "attributes") {
        const divText = textContent(child, "divisions");
        if (divText) divisions = Math.max(1, Number(divText) || divisions);
        continue;
      }
      if (tag === "direction") {
        const tempoText =
          child.querySelector("sound")?.getAttribute("tempo") ??
          textContent(child, "per-minute");
        if (tempoText) {
          const bpm = Number(tempoText);
          if (Number.isFinite(bpm) && bpm > 0) tempoBpm = bpm;
        }
        continue;
      }
      if (tag === "backup") {
        const durationText = textContent(child, "duration");
        onset = Math.max(0, onset - (Number(durationText) || 0) / divisions);
        continue;
      }
      if (tag === "forward") {
        const durationText = textContent(child, "duration");
        onset += (Number(durationText) || 0) / divisions;
        continue;
      }
      if (tag !== "note") continue;

      const durationText = textContent(child, "duration");
      const durationBeats = Math.max(0.05, (Number(durationText) || divisions) / divisions);
      const isChord = child.getElementsByTagName("chord").length > 0;
      const isRest = child.getElementsByTagName("rest").length > 0;

      if (isRest) {
        if (!isChord) onset += durationBeats;
        continue;
      }

      const pitchEl = child.getElementsByTagName("pitch")[0];
      if (!pitchEl) {
        if (!isChord) onset += durationBeats;
        continue;
      }

      const step = textContent(pitchEl, "step").toUpperCase();
      const alter = Number(textContent(pitchEl, "alter") || "0");
      const octave = Number(textContent(pitchEl, "octave"));
      const pitch = musicXmlPitch(step, alter, octave);
      if (pitch) {
        events.push({
          onsetBeats: onset,
          durationBeats,
          pitch,
        });
      }
      if (!isChord) {
        onset += durationBeats;
      }
    }
  }

  return { events, tempoBpm };
}

function parseMusicXmlDocument(
  xmlText: string,
  options: { sourcePath?: string; fallbackTitle: string },
): ImportedMusicSong[] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Invalid MusicXML document");
  }

  const workTitle =
    doc.getElementsByTagName("work-title")[0]?.textContent?.trim() ||
    doc.getElementsByTagName("movement-title")[0]?.textContent?.trim() ||
    options.fallbackTitle;
  const composer =
    doc.querySelector("creator[type='composer']")?.textContent?.trim() ||
    doc.getElementsByTagName("creator")[0]?.textContent?.trim() ||
    undefined;

  const partList = Array.from(doc.getElementsByTagName("score-part"));
  const partNameById = new Map<string, string>();
  for (const part of partList) {
    const id = part.getAttribute("id") ?? "";
    const name =
      part.getElementsByTagName("part-name")[0]?.textContent?.trim() ||
      id ||
      "Part";
    if (id) partNameById.set(id, name);
  }

  const parts = Array.from(doc.getElementsByTagName("part"));
  if (parts.length === 0) {
    throw new Error("MusicXML contained no parts");
  }

  let tempoBpm = 120;
  const tracks: MusicTrackCandidate[] = parts.map((part, index) => {
    const id = part.getAttribute("id") ?? `part-${index}`;
    const { events, tempoBpm: partTempo } = parsePartNotes(part);
    if (partTempo) tempoBpm = partTempo;
    return {
      id,
      label: partNameById.get(id) || `Part ${index + 1}`,
      notes: onsetsToNoteEvents(events),
    };
  });

  const chosen = pickDensestMonophonicTrack(tracks);
  if (!chosen) {
    throw new Error("MusicXML contained no playable melody");
  }

  return [
    buildImportedSong({
      baseId: "musicxml",
      title: workTitle,
      composer,
      tempoBpm,
      notes: chosen.notes,
      sourcePath: options.sourcePath,
    }),
  ];
}

async function extractMusicXmlFromMxl(contentBase64: string): Promise<string> {
  const bytes = bytesFromBase64(contentBase64);
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file("META-INF/container.xml");
  if (container) {
    const containerXml = await container.async("string");
    const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
    const rootfile = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
    if (rootfile) {
      const entry = zip.file(rootfile);
      if (entry) return entry.async("string");
    }
  }
  const xmlEntry = Object.keys(zip.files).find(
    (name) => name.toLowerCase().endsWith(".xml") && !name.includes("META-INF"),
  );
  if (!xmlEntry) {
    throw new Error("MXL archive did not contain MusicXML");
  }
  return zip.file(xmlEntry)!.async("string");
}

export async function parseMusicXmlSongs(
  contentBase64: string,
  options: { sourcePath?: string; fallbackTitle: string; compressed: boolean },
): Promise<ImportedMusicSong[]> {
  const xmlText = options.compressed
    ? await extractMusicXmlFromMxl(contentBase64)
    : textFromBase64(contentBase64);
  return parseMusicXmlDocument(xmlText, options);
}
