import type { ComponentType } from "react";
import {
  DownloadTrayIcon,
  EnvelopeIcon,
  GitHubIcon,
  GlobeIcon,
  LinkedInIcon,
  SourceCodeIcon,
  XMarkIcon,
} from "../components/common/SectionIcons";
import type { TranslationKey } from "../i18n";

export type AboutLinkLabelKey = Extract<
  TranslationKey,
  | "aboutGitHub"
  | "aboutSource"
  | "aboutTwitter"
  | "aboutLinkedIn"
  | "aboutWebsite"
  | "aboutDownloads"
  | "aboutEmail"
>;

export const ABOUT_LINK_LABEL_KEYS = [
  "aboutGitHub",
  "aboutSource",
  "aboutTwitter",
  "aboutLinkedIn",
  "aboutWebsite",
  "aboutDownloads",
  "aboutEmail",
] as const satisfies readonly AboutLinkLabelKey[];

type AboutLinkIcon = ComponentType<{ className?: string }>;

const ABOUT_LINK_ICONS: Record<AboutLinkLabelKey, AboutLinkIcon> = {
  aboutGitHub: GitHubIcon,
  aboutSource: SourceCodeIcon,
  aboutTwitter: XMarkIcon,
  aboutLinkedIn: LinkedInIcon,
  aboutWebsite: GlobeIcon,
  aboutDownloads: DownloadTrayIcon,
  aboutEmail: EnvelopeIcon,
};

export function aboutLinkIconFor(labelKey: AboutLinkLabelKey): AboutLinkIcon {
  return ABOUT_LINK_ICONS[labelKey];
}
