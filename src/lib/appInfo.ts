import { openUrl } from "@tauri-apps/plugin-opener";

export const APP_INFO = {
  creator: "pountzas",
  description: "Assistive virtual keyboard and mouse for Windows.",
  links: {
    github: "https://github.com/pountzas",
    githubRepo: "https://github.com/pountzas/reach-Panel",
    twitter: "https://x.com/pountzas20",
    linkedin: "https://www.linkedin.com/in/nikos-pountzas/",
    website: "https://pountzas-portfolio.vercel.app/",
    email: "mailto:nikos@pountzas.gr",
  },
} as const;

export function openExternalLink(url: string): void {
  void openUrl(url).catch((error) => {
    console.error(`Failed to open external link (${url}):`, error);
  });
}
