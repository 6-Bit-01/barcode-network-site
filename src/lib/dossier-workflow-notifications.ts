import type {
  DossierCandidate,
  DossierDraft,
  DossierDuplicateGroup,
  DossierRecommendation,
} from "@/lib/dossier-workflow";

export type DossierWorkflowNotificationTone =
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "muted";

export type DossierWorkflowNotification = {
  id: string;
  label: string;
  tone: DossierWorkflowNotificationTone;
  reason?: string;
  actionLabel?: string;
  actionHref?: string;
};

export type DossierWorkflowPublicDossierRef = {
  id: string;
  name: string;
};

type NotificationContext = {
  candidates?: DossierCandidate[];
  recommendations?: DossierRecommendation[];
  drafts?: DossierDraft[];
  duplicateGroups?: DossierDuplicateGroup[];
  publicDossiers?: DossierWorkflowPublicDossierRef[];
};

const activeRecommendationStatuses = new Set<DossierRecommendation["status"]>([
  "new",
  "reviewing",
]);

const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
  "ready_for_owner_review",
]);

const systemRecordPatterns = [
  /\bbnl\b/i,
  /barcode radio/i,
  /tiktok/i,
  /carl-bot logging/i,
  /bnl-01_member_log/i,
];

function pushUnique(
  notifications: DossierWorkflowNotification[],
  notification: DossierWorkflowNotification,
) {
  if (!notifications.some((item) => item.id === notification.id)) {
    notifications.push(notification);
  }
}

function hasPossibleIdentityLink(
  item: Pick<
    DossierCandidate | DossierRecommendation,
    "identityReviewStatus" | "possibleMatchCandidateIds"
  >,
) {
  return (
    item.identityReviewStatus === "needs_confirmation" ||
    (item.possibleMatchCandidateIds ?? []).length > 0
  );
}

function hasPendingIdentityLink(candidate: DossierCandidate) {
  return (candidate.identityLinks ?? []).some(
    (link) => link.status === "proposed",
  );
}

function activeRecommendationsForCandidate(
  candidate: DossierCandidate,
  recommendations: DossierRecommendation[] = [],
) {
  const connectedIds = new Set(candidate.connectedRecommendationIds ?? []);
  return recommendations.filter(
    (recommendation) =>
      activeRecommendationStatuses.has(recommendation.status) &&
      (connectedIds.has(recommendation.id) ||
        recommendation.targetCandidateId === candidate.id ||
        recommendation.connectedCandidateId === candidate.id ||
        recommendation.connectedSourceFileCandidateId === candidate.id),
  );
}

function activeDraftsForCandidate(
  candidate: DossierCandidate,
  drafts: DossierDraft[] = [],
) {
  return drafts.filter(
    (draft) =>
      draft.candidateId === candidate.id &&
      activeDraftStatuses.has(draft.status),
  );
}

function hasLiveDossierMatch(
  candidate: DossierCandidate,
  publicDossiers: DossierWorkflowPublicDossierRef[] = [],
) {
  if (candidate.existingDossierMatch) return true;
  const possibleIds = new Set(candidate.possibleMatchDossierIds ?? []);
  return publicDossiers.some((dossier) => possibleIds.has(dossier.id));
}

function liveDossierHref(
  candidate: DossierCandidate,
  publicDossiers: DossierWorkflowPublicDossierRef[] = [],
) {
  const dossierId =
    candidate.existingDossierMatch?.id ??
    publicDossiers.find((dossier) =>
      (candidate.possibleMatchDossierIds ?? []).includes(dossier.id),
    )?.id;
  return dossierId ? `/database/${dossierId}` : undefined;
}

function hasActiveDuplicateGroup(
  candidate: DossierCandidate,
  candidates: DossierCandidate[] = [],
  duplicateGroups: DossierDuplicateGroup[] = [],
) {
  return duplicateGroups.some((group) => {
    if (!group.candidateIds.includes(candidate.id)) return false;
    return group.candidateIds.some((candidateId) => {
      if (candidateId === candidate.id) return false;
      const peer = candidates.find((item) => item.id === candidateId);
      return peer && peer.status !== "denied" && peer.status !== "merged";
    });
  });
}

function isReviewOnlySignal(candidate: DossierCandidate) {
  return (
    candidate.confidence === "low" ||
    candidate.source === "bnl_source_knowledge_bridge" ||
    (candidate.publicSafetyNotes ?? []).length > 0 ||
    (candidate.doNotSay ?? []).length > 0
  );
}

function isSystemRecord(candidate: DossierCandidate) {
  return (
    candidate.candidateType === "interface" ||
    candidate.candidateType === "production" ||
    candidate.source === "bnl_source_file_enrichment" ||
    systemRecordPatterns.some((pattern) => pattern.test(candidate.name))
  );
}

export function buildCandidateNotifications(
  candidate: DossierCandidate,
  context: NotificationContext = {},
): DossierWorkflowNotification[] {
  const notifications: DossierWorkflowNotification[] = [];
  const candidateHref = `/admin/dossiers/candidates/${candidate.id}`;

  if (hasPossibleIdentityLink(candidate) || hasPendingIdentityLink(candidate)) {
    pushUnique(notifications, {
      id: "possible-identity-link",
      label: "Possible identity link",
      tone: "warning",
      reason: "Review before confirming aliases or routing future signals.",
      actionLabel: "Review Match",
      actionHref: candidateHref,
    });
  }

  if (candidate.connectedSourceFileCandidateId) {
    pushUnique(notifications, {
      id: "existing-source-file-match",
      label: "Existing Source File match",
      tone: "info",
      actionLabel: "Open Matched Source File",
      actionHref: `/admin/dossiers/candidates/${candidate.connectedSourceFileCandidateId}`,
    });
  }

  if (hasLiveDossierMatch(candidate, context.publicDossiers)) {
    pushUnique(notifications, {
      id: "existing-live-dossier-match",
      label: "Existing live dossier match",
      tone: "info",
      actionLabel: "Review as Live Dossier Update",
      actionHref: candidateHref,
    });
  }

  if (
    candidate.duplicateRisk === "medium" ||
    candidate.duplicateRisk === "high" ||
    hasActiveDuplicateGroup(
      candidate,
      context.candidates,
      context.duplicateGroups,
    )
  ) {
    pushUnique(notifications, {
      id: "possible-duplicate",
      label: "Possible duplicate",
      tone: candidate.duplicateRisk === "high" ? "danger" : "warning",
      actionLabel: "Review Match",
      actionHref: candidateHref,
    });
  }

  if (isReviewOnlySignal(candidate)) {
    pushUnique(notifications, {
      id: "low-confidence-review-only",
      label: "Low confidence / review-only",
      tone: "muted",
      reason:
        "Keep evidence in admin review until public-safe material is selected.",
      actionLabel: "Review Candidate",
      actionHref: candidateHref,
    });
  }

  if (
    activeRecommendationsForCandidate(candidate, context.recommendations)
      .length > 0
  ) {
    pushUnique(notifications, {
      id: "bnl-signal-attached",
      label: "BNL signal attached",
      tone: "info",
      reason:
        "Review-only signal; it does not publish or create drafts by itself.",
      actionLabel: "Review Candidate",
      actionHref: candidateHref,
    });
  }

  return notifications;
}

export function buildRecommendationNotifications(
  recommendation: DossierRecommendation,
  context: NotificationContext = {},
): DossierWorkflowNotification[] {
  const notifications: DossierWorkflowNotification[] = [];
  const recommendationHref = `/admin/dossiers/recommendations/${recommendation.id}`;

  if (
    hasPossibleIdentityLink(recommendation) ||
    recommendation.type === "identity_link"
  ) {
    pushUnique(notifications, {
      id: "possible-identity-link",
      label: "Possible identity link",
      tone: "warning",
      actionLabel: "Review Match",
      actionHref: recommendationHref,
    });
  }

  if (
    recommendation.connectedSourceFileCandidateId ||
    recommendation.targetCandidateId
  ) {
    const candidateId =
      recommendation.connectedSourceFileCandidateId ??
      recommendation.targetCandidateId;
    pushUnique(notifications, {
      id: "existing-source-file-match",
      label: "Existing Source File match",
      tone: "info",
      actionLabel: "Open Matched Source File",
      actionHref: `/admin/dossiers/candidates/${candidateId}`,
    });
  }

  const hasPublicTarget =
    Boolean(recommendation.targetDossierId) ||
    context.publicDossiers?.some((dossier) =>
      (recommendation.possibleMatchDossierIds ?? []).includes(dossier.id),
    );
  if (hasPublicTarget || recommendation.type === "modify_existing_dossier") {
    pushUnique(notifications, {
      id: "existing-live-dossier-match",
      label: "Existing live dossier match",
      tone: "info",
      actionLabel: "Review as Live Dossier Update",
      actionHref: recommendationHref,
    });
  }

  if (
    recommendation.confidence === "low" ||
    (recommendation.publicSafetyNotes ?? []).length > 0
  ) {
    pushUnique(notifications, {
      id: "low-confidence-review-only",
      label: "Low confidence / review-only",
      tone: "muted",
      reason: "BNL recommendations are review-only and do not publish.",
      actionLabel: "Review Candidate",
      actionHref: recommendationHref,
    });
  }

  return notifications;
}

export function buildSourceFileNotifications(
  candidate: DossierCandidate,
  context: NotificationContext = {},
): DossierWorkflowNotification[] {
  const notifications: DossierWorkflowNotification[] = [];
  const candidateHref = `/admin/dossiers/candidates/${candidate.id}`;
  const liveDossierExists = hasLiveDossierMatch(
    candidate,
    context.publicDossiers,
  );
  const activeDrafts = activeDraftsForCandidate(candidate, context.drafts);
  const readyDraft = activeDrafts.find(
    (draft) => draft.status === "ready_for_owner_review",
  );
  const activeDraft = activeDrafts[0];
  const activeSignals = activeRecommendationsForCandidate(
    candidate,
    context.recommendations,
  );
  const hasNewSignal =
    activeSignals.length > 0 ||
    (candidate.sourceFileNotes ?? []).some(
      (note) =>
        note.status === "active" && note.source === "bnl_recommendation",
    );

  if (isSystemRecord(candidate)) {
    pushUnique(notifications, {
      id: "system-record",
      label: "System record",
      tone: "muted",
      reason:
        "Special/system Source File; do not treat as a normal person/community candidate.",
      actionLabel: "Open Source File",
      actionHref: candidateHref,
    });
  }

  if (liveDossierExists) {
    pushUnique(notifications, {
      id: "live-dossier-exists",
      label: "Live dossier exists",
      tone: "success",
      actionLabel: "Open Live Dossier",
      actionHref: liveDossierHref(candidate, context.publicDossiers),
    });
  }

  if (activeDraft && !readyDraft) {
    pushUnique(notifications, {
      id: "draft-in-progress",
      label: "Draft in progress",
      tone: "info",
      actionLabel: "Open Draft",
      actionHref: `/admin/dossiers/drafts/${activeDraft.id}`,
    });
  }

  if (readyDraft) {
    pushUnique(notifications, {
      id: "owner-review-ready",
      label: "Owner Review ready",
      tone: "success",
      actionLabel: "Owner Review",
      actionHref: "/admin/dossiers/owner-review",
    });
  }

  if (hasNewSignal) {
    pushUnique(notifications, {
      id: "new-bnl-signal",
      label: "New BNL signal",
      tone: "info",
      reason:
        "Review-only signal; it does not publish or create Source Files automatically.",
      actionLabel: "Review Updates",
      actionHref: candidateHref,
    });
  }

  if (hasNewSignal && liveDossierExists) {
    pushUnique(notifications, {
      id: "live-dossier-update",
      label: "Live dossier update?",
      tone: "warning",
      reason:
        "Only use for potential updates to an existing live/public dossier.",
      actionLabel: "Review Updates",
      actionHref: candidateHref,
    });
  } else if (hasNewSignal && activeDraft) {
    pushUnique(notifications, {
      id: "draft-revision",
      label: "Draft revision?",
      tone: "warning",
      reason: "Active Proposed Dossier change; not a live dossier update.",
      actionLabel: "Open Draft",
      actionHref: `/admin/dossiers/drafts/${activeDraft.id}`,
    });
  }

  if (hasPossibleIdentityLink(candidate) || hasPendingIdentityLink(candidate)) {
    pushUnique(notifications, {
      id: "identity-review-pending",
      label: "Identity review pending",
      tone: "warning",
      actionLabel: "Review Identity",
      actionHref: candidateHref,
    });
  }

  if (
    (candidate.missingInfo ?? []).length > 0 ||
    candidate.status === "needs_more_evidence"
  ) {
    pushUnique(notifications, {
      id: "missing-info",
      label: "Missing info",
      tone: "warning",
      actionLabel: "Review Missing Info",
      actionHref: candidateHref,
    });
  }

  if (
    (candidate.sourceFileArchiveIds ?? []).length > 0 ||
    Boolean(candidate.latestSourceFileArchiveId) ||
    Boolean(candidate.latestSourceFileArchive)
  ) {
    pushUnique(notifications, {
      id: "bnl-archive-available",
      label: "BNL archive available",
      tone: "info",
      actionLabel: "Open Source File",
      actionHref: candidateHref,
    });
  }

  return notifications;
}
