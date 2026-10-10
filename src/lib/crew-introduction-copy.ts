import type { CrewArtistIntroduction } from "./crew-show";

export function crewIntroductionCreditLabel(source: CrewArtistIntroduction["creditSource"]): string {
 return source === "reviewed_credit" ? "Reviewed credits" : source === "inferred_credit" ? "Inferred credit grouping" : "Submitted credits";
}

/** Copies only the selected public credit facts and their retained archive boundary. */
export function crewIntroductionCopy(introduction: CrewArtistIntroduction): string {
 const line = `${introduction.artist} — ${introduction.title}${introduction.collaborators.length > 0 ? ` · feat. ${introduction.collaborators.join(", ")}` : ""}`;
 const lines = [line, `${crewIntroductionCreditLabel(introduction.creditSource)}. Archive appearances describe a credited artist group; they do not verify an account or establish complete artist history.`];
 const archive = introduction.archive;
 if (archive.available && typeof archive.showCount === "number" && Number.isFinite(archive.showCount) && archive.showCount >= 0 && typeof archive.trackCount === "number" && Number.isFinite(archive.trackCount) && archive.trackCount >= 0) {
  lines.push(`${archive.showCount} retained public ${archive.showCount === 1 ? "show" : "shows"} · ${archive.trackCount} credited ${archive.trackCount === 1 ? "track" : "tracks"}. Archive coverage begins ${archive.historyCoverageStartedAt}.`);
 }
 return lines.join("\n");
}
