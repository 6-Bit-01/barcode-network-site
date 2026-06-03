import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
} from "./dossier-workflow";
import { createDossierSourceFileSummary } from "./dossier-source-file-summary";

export function createDossierSourceMeaning(input: {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  recommendations?: DossierRecommendation[];
}) {
  return createDossierSourceFileSummary(input);
}
