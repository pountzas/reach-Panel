/** Known apps that can show an “install” hint when missing. */

export interface InstallableApp {
  /** Matches action target (case-insensitive substring or exact). */
  matchTarget: (target: string) => boolean;
  name: string;
  installUrl: string;
  /** Probe targets used to detect installation. */
  probeTargets: string[];
}

export const INSTALLABLE_APPS: InstallableApp[] = [
  {
    name: "Spotify",
    installUrl: "https://www.spotify.com/download/windows/",
    probeTargets: ["spotify"],
    matchTarget: (target) => {
      const t = target.toLowerCase();
      return t === "spotify" || t === "spotify.exe" || t.includes("spotify");
    },
  },
  {
    name: "TeamSpeak",
    installUrl: "https://www.teamspeak.com/en/downloads/",
    probeTargets: [
      "teamspeak",
      "ts3client_win64",
      "ts3client_win32",
    ],
    matchTarget: (target) => {
      const t = target.toLowerCase();
      return (
        t.includes("teamspeak") ||
        t.includes("ts3client") ||
        t === "ts3" ||
        t === "ts3.exe"
      );
    },
  },
];

export function findInstallableApp(
  target: string,
): InstallableApp | undefined {
  return INSTALLABLE_APPS.find((app) => app.matchTarget(target));
}
