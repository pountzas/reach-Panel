import {
  fileExtension,
  fileStem,
  textFromBase64,
  type ImportedMusicSong,
} from "./importTypes";
import { parseJsonSongs } from "./parseJsonSong";
import { parseMidiSongs } from "./parseMidiSong";
import { parseMusicXmlSongs } from "./parseMusicXmlSong";

export type MusicFilePayload = {
  path: string;
  contentBase64: string;
};

/** Parse a picked song file into one or more imported songs (auto track pick for MIDI/MusicXML). */
export async function parseMusicFilePayload(
  payload: MusicFilePayload,
): Promise<ImportedMusicSong[]> {
  const ext = fileExtension(payload.path);
  const fallbackTitle = fileStem(payload.path) || "Imported song";
  const options = { sourcePath: payload.path, fallbackTitle };

  switch (ext) {
    case "json":
      return parseJsonSongs(textFromBase64(payload.contentBase64), options);
    case "mid":
    case "midi":
      return parseMidiSongs(payload.contentBase64, options);
    case "xml":
    case "musicxml":
      return parseMusicXmlSongs(payload.contentBase64, {
        ...options,
        compressed: false,
      });
    case "mxl":
      return parseMusicXmlSongs(payload.contentBase64, {
        ...options,
        compressed: true,
      });
    default:
      throw new Error(`Unsupported song file type: .${ext || "?"}`);
  }
}
