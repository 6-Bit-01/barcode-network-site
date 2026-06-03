import type { DatabaseEntry } from "@/content";
import { getDossierPrimaryLink } from "@/lib/dossier-links";
import { getEntryImage } from "@/lib/placeholder";

export type DossierPageViewModel = {
  id: string;
  name: string;
  image: string;
  category: string;
  kind?: string;
  ecosystemLane?: string;
  identityAuthority?: string;
  status: string;
  clearance: string;
  origin: string;
  role: string;
  summary: string;
  notes?: string;
  tags: string[];
  link?: string;
  primaryLink?: ReturnType<typeof getDossierPrimaryLink>;
  links?: DatabaseEntry["links"];
  files: DatabaseEntry["files"];
  terminalLead: string;
};

const terminalCommands = [
  "TRACE DOSSIER ROUTE",
  "PULL ENTITY RECORD",
  "DECODE NETWORK SIGNATURE",
  "OPEN ARCHIVE NODE",
];

export function buildDossierTerminalLead(entry: { id: string; category: string }) {
  const commandIndex =
    entry.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    terminalCommands.length;

  return `> ${terminalCommands[commandIndex]} // TARGET: ${entry.id} // ${entry.category.toUpperCase()}`;
}

export function createDossierPageViewModel(
  entry: DatabaseEntry,
): DossierPageViewModel {
  return {
    ...entry,
    image: getEntryImage(entry),
    primaryLink: getDossierPrimaryLink(entry),
    terminalLead: buildDossierTerminalLead(entry),
  };
}
