import {
  normalizeDossierSubjectName,
  type DossierCandidate,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierRecommendation,
  type DossierSourceFileRefreshRequest,
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
  actionDestinationKey?: string;
  actionGroup?: DossierDashboardAction["group"];
};

export type DossierSourceFileFocus =
  | "overview"
  | "identity"
  | "missing-info"
  | "signals"
  | "archive"
  | "dossier"
  | "refresh";

export const dossierSourceFileFocusSectionIds: Record<
  DossierSourceFileFocus,
  string
> = {
  overview: "source-file-overview",
  identity: "source-file-identity",
  "missing-info": "source-file-missing-info",
  signals: "source-file-signals",
  archive: "source-file-archive",
  dossier: "source-file-dossier",
  refresh: "source-file-refresh",
};

export type DossierDashboardAction = {
  label: string;
  href: string;
  destinationKey: string;
  group?: "primary" | "source-file" | "external" | "archive";
};

export function sourceFileFocusHref(
  candidateId: string,
  focus: DossierSourceFileFocus,
) {
  return `/admin/dossiers/candidates/${candidateId}?focus=${focus}`;
}

export function dedupeDossierDashboardActions(
  actions: DossierDashboardAction[],
) {
  const byDestination = new Map<string, DossierDashboardAction>();
  const exactHrefs = new Set<string>();
  for (const action of actions) {
    if (!action.href || exactHrefs.has(action.href)) continue;
    if (byDestination.has(action.destinationKey)) continue;
    byDestination.set(action.destinationKey, action);
    exactHrefs.add(action.href);
  }
  return Array.from(byDestination.values());
}

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
  sourceFileRefreshRequests?: DossierSourceFileRefreshRequest[];
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


function focusAction(
  candidateId: string,
  focus: DossierSourceFileFocus,
  label: string,
): Pick<
  DossierWorkflowNotification,
  "actionLabel" | "actionHref" | "actionDestinationKey" | "actionGroup"
> {
  return {
    actionLabel: label,
    actionHref: sourceFileFocusHref(candidateId, focus),
    actionDestinationKey: dossierSourceFileFocusSectionIds[focus],
    actionGroup: "source-file",
  };
}

function latestRefreshRequestForCandidate(
  candidate: DossierCandidate,
  requests: DossierSourceFileRefreshRequest[] = [],
) {
  const normalizedSubjectKey = normalizeDossierSubjectName(candidate.name);
  return requests
    .filter(
      (request) =>
        request.candidateId === candidate.id ||
        request.normalizedSubjectKey === normalizedSubjectKey,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function hasRefreshStatusForDashboard(
  candidate: DossierCandidate,
  requests: DossierSourceFileRefreshRequest[] = [],
) {
  const latestRequest = latestRefreshRequestForCandidate(candidate, requests);
  return Boolean(
    latestRequest &&
      (latestRequest.status === "failed" || latestRequest.status === "skipped"),
  );
}

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

function hasPossibleDuplicate(
  candidate: DossierCandidate,
  context: Pick<NotificationContext, "candidates" | "duplicateGroups"> = {},
) {
  return (
    candidate.duplicateRisk === "medium" ||
    candidate.duplicateRisk === "high" ||
    hasActiveDuplicateGroup(
      candidate,
      context.candidates,
      context.duplicateGroups,
    )
  );
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
    systemRecordPatterns.some((pattern) => pattern.test(candidate.name))
  );
}

export function isLiveDossierUpdateRecommendation(
  recommendation: DossierRecommendation,
  context: Pick<NotificationContext, "candidates" | "publicDossiers"> = {},
) {
  if (recommendation.type === "modify_existing_dossier") return true;
  if (recommendation.targetDossierId) return true;
  if (!recommendation.targetCandidateId) return false;

  const targetCandidate = context.candidates?.find(
    (candidate) => candidate.id === recommendation.targetCandidateId,
  );
  return targetCandidate
    ? hasLiveDossierMatch(targetCandidate, context.publicDossiers)
    : false;
}

export function buildCandidateNotifications(
  candidate: DossierCandidate,
  context: NotificationContext = {},
): DossierWorkflowNotification[] {
  const notifications: DossierWorkflowNotification[] = [];
  const candidateHref = sourceFileFocusHref(candidate.id, "overview");

  if (hasPossibleIdentityLink(candidate) || hasPendingIdentityLink(candidate)) {
    pushUnique(notifications, {
      id: "possible-identity-link",
      label: "Possible identity link",
      tone: "warning",
      reason: "Review before confirming aliases or routing future signals.",
      ...focusAction(candidate.id, "identity", "Review Identity Links"),
    });
  }

  if (hasPossibleDuplicate(candidate, context)) {
    pushUnique(notifications, {
      id: "possible-duplicate",
      label: "Possible duplicate",
      tone: "warning",
      ...focusAction(candidate.id, "identity", "Review Identity Links"),
    });
  }

  if (candidate.connectedSourceFileCandidateId) {
    pushUnique(notifications, {
      id: "existing-source-file-match",
      label: "Existing Source File linked",
      tone: "info",
      actionLabel: "Open Matched Source File",
      actionHref: sourceFileFocusHref(
        candidate.connectedSourceFileCandidateId,
        "overview",
      ),
      actionDestinationKey: "source-file-overview",
      actionGroup: "source-file",
    });
  }

  if (hasLiveDossierMatch(candidate, context.publicDossiers)) {
    pushUnique(notifications, {
      id: "existing-live-dossier-match",
      label: "Live dossier exists",
      tone: "info",
      actionLabel: "Open Live Dossier",
      actionHref:
        liveDossierHref(candidate, context.publicDossiers) ?? candidateHref,
      actionDestinationKey: "live-dossier",
      actionGroup: "external",
    });
  }

  if (
    activeRecommendationsForCandidate(candidate, context.recommendations)
      .length > 0
  ) {
    pushUnique(notifications, {
      id: "bnl-signal-attached",
      label: "New BNL signals attached",
      tone: "info",
      reason:
        "Review-only signal; it does not publish or create drafts by itself.",
      ...focusAction(candidate.id, "signals", "Review BNL Signals"),
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
      actionLabel: "Review Identity Links",
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
      label: "Existing Source File linked",
      tone: "info",
      actionLabel: "Open Source File",
      actionHref: sourceFileFocusHref(candidateId ?? "", "overview"),
      actionDestinationKey: "source-file-overview",
      actionGroup: "source-file",
    });
  }

  if (
    isLiveDossierUpdateRecommendation(recommendation, context) ||
    context.publicDossiers?.some((dossier) =>
      (recommendation.possibleMatchDossierIds ?? []).includes(dossier.id),
    )
  ) {
    pushUnique(notifications, {
      id: "existing-live-dossier-match",
      label: "Live dossier exists",
      tone: "info",
      actionLabel: "Open Live Dossier",
      actionHref: recommendation.targetDossierId
        ? `/database/${recommendation.targetDossierId}`
        : recommendationHref,
      actionDestinationKey: "live-dossier",
      actionGroup: "external",
    });
  }

  return notifications;
}

export function buildSourceFileNotifications(
  candidate: DossierCandidate,
  context: NotificationContext = {},
): DossierWorkflowNotification[] {
  const notifications: DossierWorkflowNotification[] = [];
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
      ...focusAction(candidate.id, "overview", "Open Source File"),
    });
  }

  if (liveDossierExists) {
    pushUnique(notifications, {
      id: "live-dossier-exists",
      label: "Live dossier exists",
      tone: "success",
      actionLabel: "Open Live Dossier",
      actionHref: liveDossierHref(candidate, context.publicDossiers),
      actionDestinationKey: "live-dossier",
      actionGroup: "external",
    });
  }

  if (activeDraft && !readyDraft) {
    pushUnique(notifications, {
      id: "draft-in-progress",
      label: "Proposed Dossier in progress",
      tone: "info",
      actionLabel: "Open Proposed Dossier",
      actionHref: `/admin/dossiers/drafts/${activeDraft.id}`,
      actionDestinationKey: "proposed-dossier",
      actionGroup: "external",
    });
  }

  if (readyDraft) {
    pushUnique(notifications, {
      id: "owner-review-ready",
      label: "Proposed Dossier ready for Owner Review",
      tone: "success",
      actionLabel: "Owner Review",
      actionHref: "/admin/dossiers/owner-review",
      actionDestinationKey: "owner-review",
      actionGroup: "external",
    });
  }

  if (hasNewSignal) {
    pushUnique(notifications, {
      id: "new-bnl-signal",
      label: "New BNL signals attached",
      tone: "info",
      reason:
        "Review-only signal; it does not publish or create Source Files automatically.",
      ...focusAction(candidate.id, "signals", "Review BNL Signals"),
    });
  }

  if (hasNewSignal && liveDossierExists) {
    pushUnique(notifications, {
      id: "live-dossier-update",
      label: "Live dossier exists",
      tone: "warning",
      reason:
        "Only use for potential updates to an existing live/public dossier.",
    });
  } else if (hasNewSignal && activeDraft) {
    pushUnique(notifications, {
      id: "draft-revision",
      label: "Proposed Dossier in progress",
      tone: "warning",
      reason: "Active Proposed Dossier change; not a live dossier update.",
      actionLabel: "Open Proposed Dossier",
      actionHref: `/admin/dossiers/drafts/${activeDraft.id}`,
      actionDestinationKey: "proposed-dossier",
      actionGroup: "external",
    });
  }

  if (hasPossibleIdentityLink(candidate) || hasPendingIdentityLink(candidate)) {
    pushUnique(notifications, {
      id: "identity-review-pending",
      label: "Possible identity link",
      tone: "warning",
      ...focusAction(candidate.id, "identity", "Review Identity Links"),
    });
  }

  if (hasPossibleDuplicate(candidate, context)) {
    pushUnique(notifications, {
      id: "possible-duplicate",
      label: "Possible duplicate",
      tone: "warning",
      ...focusAction(candidate.id, "identity", "Review Identity Links"),
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
      ...focusAction(candidate.id, "missing-info", "Review Missing Info"),
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
      ...focusAction(candidate.id, "archive", "Open BNL Archive"),
    });
  }


  if (
    hasRefreshStatusForDashboard(candidate, context.sourceFileRefreshRequests)
  ) {
    pushUnique(notifications, {
      id: "refresh-status",
      label: "FILE NOT UPDATED",
      tone: "warning",
      ...focusAction(candidate.id, "refresh", "View Refresh Status"),
    });
  }

  return notifications;
}
