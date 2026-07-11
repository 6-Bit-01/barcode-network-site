import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWheelSegments, derangedWheelCandidateOrder, detectMaterialPlaybackSeek, estimateOneWayNetworkTransitMs, playbackCorrectionTarget, projectObservedPlaybackTime, resolveLiveOverlayScene, roundPlaybackDriftSeconds, serverRelativeSyncAgeSeconds, serverStampTikTokSync, serverStampYouTubeSync, shouldCorrectPlaybackDrift, updateTransitEstimateMs, youtubePresentationFromUrl, WHEEL_RIGHT_POINTER_ANGLE_DEGREES, wheelFinalRotationForSegment, wheelFinalRotationForSlice, wheelSegmentAtPointer, wheelSliceIndexAtPointer, wheelUprightLabelRotationDegrees } from "../src/lib/live-overlay-resolver.ts";

const session = { sessionId: "s1", status: "open", queueOpen: true, wheelSpinsOwed: 0, sponsorBreakStatus: "not_due", broadcastPhase: "broadcast_active" };
const youtubeTrack = { id: "yt1", submittedArtistName: "Artist Name", submittedSongTitle: "Video Track", sourceType: "youtube", sourceArtworkUrl: "https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg", link: "https://youtube.com/watch?v=abcdefghijk", durationLabel: "3:30", youtubeVideoId: "abcdefghijk" };
const spotifyTrack = { id: "sp1", submittedArtistName: "Spotify Artist", submittedSongTitle: "Audio Track", sourceType: "spotify", sourceArtworkUrl: "https://i.scdn.co/image/example", link: "https://open.spotify.com/track/abc123", durationLabel: "2:45" };


assert.equal(projectObservedPlaybackTime("playing", 10, 1_000, 2_500), 11.5, "playing projection advances from observation time");
assert.equal(projectObservedPlaybackTime("paused", 10, 1_000, 2_500), 10, "paused projection does not advance");
assert.equal(projectObservedPlaybackTime("stopped", 10, 1_000, 2_500), 10, "stopped projection does not advance");
assert.equal(projectObservedPlaybackTime("playing", 10, 1_000, 5_000, 12), 12, "projection clamps to duration");
assert.equal(projectObservedPlaybackTime("playing", 0, 1_000, 1_000), 0, "projection accepts zero");
assert.equal(projectObservedPlaybackTime("playing", Number.NaN, 1_000, 2_000), null, "invalid projection returns null");
assert.equal(serverRelativeSyncAgeSeconds("2026-07-11T00:00:00.000Z", Date.parse("2026-07-11T00:00:01.000Z"), 500), 1.5, "serverRelativeSyncAgeSeconds uses serverNow and elapsed monotonic time");
assert.equal(serverRelativeSyncAgeSeconds("2026-07-11T00:00:00.000Z", Date.parse("2026-07-11T00:00:00.000Z"), 0), 0, "zero age is valid");
assert.equal(serverRelativeSyncAgeSeconds("2026-07-11T00:00:01.000Z", Date.parse("2026-07-11T00:00:00.000Z"), 0), 0, "negative calculated age clamps to zero");
assert.equal(serverRelativeSyncAgeSeconds("not-a-date", Date.parse("2026-07-11T00:00:00.000Z"), 0), null, "invalid updatedAt returns null");
assert.equal(serverRelativeSyncAgeSeconds("2026-07-11T00:00:00.000Z", Number.NaN, 0), null, "invalid serverNow returns null");
assert.equal(serverRelativeSyncAgeSeconds("2026-07-11T00:00:00.000Z", Date.parse("2026-07-11T00:00:00.000Z"), Number.NaN), null, "invalid elapsed time returns null");
assert.equal(estimateOneWayNetworkTransitMs(120, 40), 40, "transport estimate subtracts server processing and halves network time");
assert.equal(estimateOneWayNetworkTransitMs(1000, 0), 300, "transport estimate clamps to 300ms");
assert.equal(estimateOneWayNetworkTransitMs(Number.NaN, 0), 0, "invalid RTT returns zero transit");
assert.equal(estimateOneWayNetworkTransitMs(120, -10), 60, "negative server processing is treated safely");
assert.equal(estimateOneWayNetworkTransitMs(80, 120), 0, "server processing greater than RTT yields zero transit");
assert.equal(updateTransitEstimateMs(null, 42), 42, "first valid transit estimate initializes EMA");
assert.equal(updateTransitEstimateMs(40, 80), 50, "later transit estimates use 75/25 EMA");
assert.equal(updateTransitEstimateMs(290, 1000), 292.5, "transit EMA remains bounded before smoothing and under max");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: -0.21, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), true, "YouTube behind drift past 0.20 triggers correction");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: -0.19, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), false, "YouTube behind drift inside 0.20 does not correct");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: 0.69, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), false, "YouTube ahead drift inside 0.70 does not correct");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: 0.71, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), true, "YouTube ahead drift past 0.70 triggers correction");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: -0.31, behindThresholdSeconds: 0.3, aheadThresholdSeconds: 0.85, pausedThresholdSeconds: 0.35 }), true, "TikTok behind drift past 0.30 triggers correction");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: -0.29, behindThresholdSeconds: 0.3, aheadThresholdSeconds: 0.85, pausedThresholdSeconds: 0.35 }), false, "TikTok behind drift inside 0.30 does not correct");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: 0.84, behindThresholdSeconds: 0.3, aheadThresholdSeconds: 0.85, pausedThresholdSeconds: 0.35 }), false, "TikTok ahead drift inside 0.85 does not correct");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: 0.86, behindThresholdSeconds: 0.3, aheadThresholdSeconds: 0.85, pausedThresholdSeconds: 0.35 }), true, "TikTok ahead drift past 0.85 triggers correction");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "paused", driftSeconds: 0.26, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), true, "paused drift uses the paused threshold");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "stopped", driftSeconds: -0.26, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), true, "stopped drift uses the paused threshold");
assert.equal(shouldCorrectPlaybackDrift({ playbackState: "playing", driftSeconds: Number.NaN, behindThresholdSeconds: 0.2, aheadThresholdSeconds: 0.7, pausedThresholdSeconds: 0.25 }), false, "invalid drift does not correct");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: 10, driftSeconds: -0.2, maximumCatchUpSeconds: 0.3 }), 10.1, "behind playing drift adds half the observed lag");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: 10, driftSeconds: -1, maximumCatchUpSeconds: 0.2 }), 10.2, "YouTube catch-up clamps to 0.20 seconds");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: 10, driftSeconds: -1, maximumCatchUpSeconds: 0.3 }), 10.3, "TikTok catch-up clamps to 0.30 seconds");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: 10, driftSeconds: 0.8, maximumCatchUpSeconds: 0.3 }), 10, "ahead drift adds no catch-up");
assert.equal(playbackCorrectionTarget({ playbackState: "paused", expectedTimeSeconds: 10, driftSeconds: -1, maximumCatchUpSeconds: 0.3 }), 10, "paused adds no catch-up");
assert.equal(playbackCorrectionTarget({ playbackState: "stopped", expectedTimeSeconds: 10, driftSeconds: -1, maximumCatchUpSeconds: 0.3 }), 10, "stopped adds no catch-up");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: 10, driftSeconds: -1, maximumCatchUpSeconds: 0.3, durationSeconds: 10.1 }), 10.1, "correction target clamps to duration");
assert.equal(playbackCorrectionTarget({ playbackState: "playing", expectedTimeSeconds: Number.NaN, driftSeconds: -1, maximumCatchUpSeconds: 0.3 }), null, "invalid expected time returns null");
assert.equal(detectMaterialPlaybackSeek({ playbackState: "playing", previousTimeSeconds: 10, previousObservedAtMs: 1_000, currentTimeSeconds: 11, currentObservedAtMs: 2_000 }), false, "normal playing progression is not a seek");
assert.equal(detectMaterialPlaybackSeek({ playbackState: "playing", previousTimeSeconds: 10, previousObservedAtMs: 1_000, currentTimeSeconds: 15, currentObservedAtMs: 2_000 }), true, "abnormal playing jump is a seek");
assert.equal(detectMaterialPlaybackSeek({ playbackState: "paused", previousTimeSeconds: 10, previousObservedAtMs: 1_000, currentTimeSeconds: 10.4, currentObservedAtMs: 2_000 }), true, "paused timeline movement is a seek");
assert.equal(detectMaterialPlaybackSeek({ playbackState: "stopped", previousTimeSeconds: 0, previousObservedAtMs: 1_000, currentTimeSeconds: 0.5, currentObservedAtMs: 2_000 }), true, "stopped timeline movement is a seek");
assert.equal(roundPlaybackDriftSeconds(1.234), 1.23, "signed drift rounds to two decimals");
assert.equal(Object.is(roundPlaybackDriftSeconds(-0.001), -0), false, "negative zero normalizes to zero");

const youtubePresentationCases = [
  ["https://youtube.com/shorts/abc123", "short"],
  ["https://www.youtube.com/shorts/abc123", "short"],
  ["https://m.youtube.com/shorts/abc123", "short"],
  ["https://youtube.com/shorts/abc123?feature=share", "short"],
  ["https://youtube.com/shorts/abc123#clip", "short"],
  ["https://youtube.com/shorts/x", undefined],
  ["https://youtube.com/shorts/abc 123", undefined],
  ["https://youtube.com/shorts/abc$123", undefined],
  ["https://youtube.com/watch?v=abc123", "standard"],
  ["https://www.youtube.com/watch?v=abc123", "standard"],
  ["https://m.youtube.com/watch?v=abc123", "standard"],
  ["https://music.youtube.com/watch?v=abc123", "standard"],
  ["https://youtube.com/watch?v=x", undefined],
  ["https://youtube.com/watch?v=abc 123", undefined],
  ["https://youtu.be/abc123", "standard"],
  ["https://youtu.be/x", undefined],
  ["https://youtube.com/embed/abc123", "standard"],
  ["https://youtube.com/embed/x", undefined],
  ["https://example.com/watch?v=abcdefghijk", undefined],
  ["not a url", undefined],
  ["https://youtube.com/channel/UCabc123", undefined],
  ["https://youtube.com/@barcode", undefined],
  ["https://youtube.com/", undefined],
];
for (const [url, expected] of youtubePresentationCases) {
  assert.equal(youtubePresentationFromUrl(url), expected, `${url} resolves YouTube presentation ${expected ?? "undefined"}`);
}

function finalRotationForPointerLocalAngle(localAngle, pointerAngle = WHEEL_RIGHT_POINTER_ANGLE_DEGREES) {
  return 1080 + pointerAngle - localAngle;
}

assert.equal(wheelSliceIndexAtPointer(4, finalRotationForPointerLocalAngle(44)), 0, "4 candidates: right pointer inside slice 0 selects candidate 0");
assert.equal(wheelSliceIndexAtPointer(4, finalRotationForPointerLocalAngle(91)), 1, "4 candidates: right pointer inside slice 1 selects candidate 1");
assert.equal(wheelSliceIndexAtPointer(8, finalRotationForPointerLocalAngle(44.999)), 0, "8 candidates: just before boundary keeps previous slice");
assert.equal(wheelSliceIndexAtPointer(8, finalRotationForPointerLocalAngle(45.001)), 1, "8 candidates: just after boundary selects next slice");
assert.equal(wheelSliceIndexAtPointer(13, finalRotationForPointerLocalAngle(201.4)), 7, "13 candidates: arbitrary angle uses floor boundary math");
assert.equal(wheelSliceIndexAtPointer(8, finalRotationForPointerLocalAngle(45.001) + 360 * 9), 1, "final rotation wrapping past multiple turns still normalizes to the correct slice");
assert.equal(wheelSliceIndexAtPointer(4, 0, WHEEL_RIGHT_POINTER_ANGLE_DEGREES), 1, "right-side pointer uses 3 o'clock selector rather than top selector");
assert.equal(wheelSliceIndexAtPointer(8, wheelFinalRotationForSlice(8, 6)), 6, "final rotation helper lands the stored winner slice under the right pointer");
const weightedSegments = buildWheelSegments([{ id: "small-a", label: "Small A", weight: 1 }, { id: "large", label: "Large", weight: 2 }, { id: "small-b", label: "Small B", weight: 1 }]);
assert.deepEqual(weightedSegments.map((segment) => [segment.startAngle, segment.endAngle]), [[0, 90], [90, 270], [270, 360]], "weighted segments expose variable section boundaries");
assert.equal(wheelSegmentAtPointer(weightedSegments, finalRotationForPointerLocalAngle(180)).candidateId, "large", "weighted hit test resolves inside larger segment");
assert.equal(wheelSegmentAtPointer(weightedSegments, finalRotationForPointerLocalAngle(90)).candidateId, "large", "exact boundary belongs to next clockwise segment");
assert.equal(wheelSegmentAtPointer(weightedSegments, wheelFinalRotationForSegment(weightedSegments[2])).candidateId, "small-b", "weighted final rotation helper lands the stored segment under the right pointer");
const relabeledWeightedSegments = buildWheelSegments([{ id: "small-a", label: "Tiny", weight: 1 }, { id: "large", label: "Very Long Label That Wraps", weight: 2 }, { id: "small-b", label: "Six", weight: 1 }]);
assert.equal(wheelSegmentAtPointer(relabeledWeightedSegments, finalRotationForPointerLocalAngle(180)).candidateId, "large", "label text changes do not affect segment geometry winner result");

const rightSideSegments = buildWheelSegments([{ id: "top", label: "Top" }, { id: "right", label: "Right pointer" }, { id: "bottom", label: "Bottom" }, { id: "left", label: "Left" }]);
const rightSideFinalRotation = wheelFinalRotationForSegment(rightSideSegments[1]);
assert.equal(wheelSegmentAtPointer(rightSideSegments, rightSideFinalRotation, WHEEL_RIGHT_POINTER_ANGLE_DEGREES).candidateId, "right", "stored final rotation lands the selected segment under the visual right-side pointer");
assert.equal(Math.abs(wheelUprightLabelRotationDegrees(90)) <= 90, true, "label near right-side pointer remains upright");
assert.equal(Math.abs(wheelUprightLabelRotationDegrees(270)) <= 90, true, "label on opposite side is flipped out of upside-down orientation");
assert.equal([0, 45, 90, 135, 180, 225, 270, 315].every((angle) => Math.abs(wheelUprightLabelRotationDegrees(angle)) <= 90), true, "wheel label rotation helper never returns upside-down text orientation");

assert.equal(resolveLiveOverlayScene({}).mode, "standby", "no session resolves to standby");
assert.equal(resolveLiveOverlayScene({ currentSession: session }).mode, "session_active", "open session with no track resolves to intake/session scene");

const youtubeNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack });
assert.equal(youtubeNowPlaying.mode, "now_playing", "YouTube track resolves to now playing");
assert.equal(youtubeNowPlaying.youtube, undefined, "YouTube track without fresh host sync falls back to now playing card");
assert.equal(youtubeNowPlaying.track?.youtubePresentation, "standard", "resolved watch-link track carries standard YouTube presentation");

const freshNow = new Date("2026-07-10T00:00:10.000Z");
const freshSync = { provider: "youtube", videoId: "abcdefghijk", trackId: "yt1", playbackState: "playing", currentTimeSeconds: 12, updatedAt: "2026-07-10T00:00:06.000Z", muted: true };
const matchingFresh = resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: freshSync, now: freshNow });
assert.equal(matchingFresh.youtube?.videoId, "abcdefghijk", "matching fresh YouTube player sync is used");
assert.equal(matchingFresh.youtube?.currentTimeSeconds, 12, "matching fresh sync preserves reported host time");
assert.equal(matchingFresh.track?.youtubePresentation, "standard", "YouTube presentation classification does not affect sync matching");
const shortsNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: { ...youtubeTrack, id: "yt-short", link: "https://youtube.com/shorts/abc123", youtubeVideoId: "abc123" } });
assert.equal(shortsNowPlaying.track?.youtubePresentation, "short", "resolved valid Shorts track carries short YouTube presentation");
const invalidShortsNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: { ...youtubeTrack, id: "yt-bad-short", link: "https://youtube.com/shorts/x", youtubeVideoId: "x" } });
assert.equal(invalidShortsNowPlaying.track?.youtubePresentation, undefined, "invalid YouTube video URLs do not receive presentation classification");
const shortLinkNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: { ...youtubeTrack, id: "yt-be", link: "https://youtu.be/abc123", youtubeVideoId: "abc123" } });
assert.equal(shortLinkNowPlaying.track?.youtubePresentation, "standard", "resolved youtu.be track carries standard YouTube presentation");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, now: freshNow }).youtube, undefined, "missing player sync does not fabricate playing from zero");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: { ...freshSync, videoId: "zzzzzzzzzzz" }, now: freshNow }).youtube, undefined, "mismatched video ID does not fabricate playing from zero");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: { ...freshSync, trackId: "other-track" }, now: freshNow }).youtube, undefined, "mismatched queue track ID does not control current track");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: { ...freshSync, updatedAt: "2026-07-10T00:00:00.000Z" }, now: new Date("2026-07-10T00:00:20.000Z") }).youtube, undefined, "stale player sync falls back safely");
const pausedSync = { ...freshSync, playbackState: "paused", currentTimeSeconds: 42 };
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: pausedSync, now: freshNow }).youtube?.playbackState, "paused", "paused sync remains paused at the reported time");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: pausedSync, now: freshNow }).youtube?.currentTimeSeconds, 42, "paused sync keeps reported time");
const pausedHeartbeat = { ...pausedSync, updatedAt: "2026-07-10T00:00:18.000Z" };
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: pausedHeartbeat, now: new Date("2026-07-10T00:00:30.000Z") }).youtube?.playbackState, "paused", "paused heartbeat remains fresh beyond the first 12 seconds of pause");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: pausedHeartbeat, now: new Date("2026-07-10T00:00:30.000Z") }).youtube?.currentTimeSeconds, 42, "paused heartbeat keeps the same current time");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: { ...pausedSync, updatedAt: "2026-07-10T00:00:00.000Z" }, now: new Date("2026-07-10T00:00:30.000Z") }).youtube, undefined, "genuinely stale paused sync falls back safely when the host is gone");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: spotifyTrack, playerSync: freshSync, now: freshNow }).youtube, undefined, "non-YouTube tracks do not retain previous YouTube sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: { ...youtubeTrack, id: "yt2", link: "https://youtube.com/watch?v=zzzzzzzzzzz", youtubeVideoId: "zzzzzzzzzzz" }, playerSync: freshSync, now: freshNow }).youtube, undefined, "changing loaded track clears obsolete sync from resolver control");
const zeroReadOne = resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, now: freshNow }).youtube;
const zeroReadTwo = resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, now: freshNow }).youtube;
assert.equal(zeroReadOne, undefined, "first overlay read without sync has no generated zero-time sync");
assert.equal(zeroReadTwo, undefined, "repeated overlay reads do not generate a new zero-time sync");

const serverReceipt = new Date("2026-07-10T00:01:00.000Z");
const tiktokTrack = { id: "tt1", submittedArtistName: "TikTok Artist", submittedSongTitle: "Vertical Track", sourceType: "tiktok", sourceArtworkUrl: "https://www.tiktok.com/example.jpg", link: "https://www.tiktok.com/@scout2015/video/6718335390845095173", durationLabel: "0:59", tiktokPostId: "6718335390845095173" };
const freshTikTokSync = { provider: "tiktok", postId: "6718335390845095173", trackId: "tt1", playbackState: "playing", currentTimeSeconds: 12, durationSeconds: 59, updatedAt: "2026-07-10T00:00:06.000Z", muted: true };
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).tiktok, undefined, "TikTok track without sync resolves to normal Now Playing card");
assert.deepEqual(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).tiktokPreload, { postId: "6718335390845095173", trackId: "tt1" }, "resolver exposes TikTok preload identity for a valid current TikTok track");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).mode, "now_playing", "TikTok preload does not replace the normal Now Playing card");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).tiktok, undefined, "TikTok preload does not create authoritative playback sync");
const matchingTikTok = resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow });
assert.equal(matchingTikTok.tiktok?.postId, "6718335390845095173", "fresh matching TikTok sync is accepted");
assert.equal(matchingTikTok.youtube, undefined, "TikTok sync scene does not also contain YouTube sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, postId: "6718335390845095174" }, now: freshNow }).tiktok, undefined, "TikTok post ID mismatch is rejected");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, trackId: "other" }, now: freshNow }).tiktok, undefined, "TikTok track ID mismatch is rejected");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, updatedAt: "2026-07-10T00:00:00.000Z" }, now: new Date("2026-07-10T00:00:20.000Z") }).tiktok?.playbackState, "playing", "matching playing TikTok sync older than 12 seconds remains active");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, updatedAt: "2026-07-09T17:00:00.000Z" }, now: new Date("2026-07-10T00:00:20.000Z") }).tiktok, undefined, "playing TikTok sync older than 6 hours is rejected");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, updatedAt: "2099-01-01T00:00:00.000Z" }, now: freshNow }).tiktok, undefined, "future TikTok sync timestamp is rejected safely");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, updatedAt: "not-a-date" }, now: freshNow }).tiktok, undefined, "invalid TikTok sync timestamp is rejected safely");
const pausedTikTok = { ...freshTikTokSync, playbackState: "paused", currentTimeSeconds: 42 };
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: pausedTikTok, now: freshNow }).tiktok?.currentTimeSeconds, 42, "paused TikTok sync preserves the reported time");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...pausedTikTok, updatedAt: "2026-07-10T00:00:00.000Z" }, now: new Date("2026-07-10T00:00:30.000Z") }).tiktok?.playbackState, "paused", "matching paused TikTok sync older than 12 seconds remains active");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow }).tiktok?.playbackState, "playing", "playing TikTok sync remains playing");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, playbackState: "stopped" }, now: freshNow }).tiktok?.playbackState, "stopped", "fresh stopped TikTok sync remains stopped");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: { ...freshTikTokSync, playbackState: "stopped", updatedAt: "2026-07-10T00:00:00.000Z" }, now: new Date("2026-07-10T00:00:20.000Z") }).tiktok, undefined, "stopped TikTok sync older than 12 seconds is rejected");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: spotifyTrack, playerSync: freshTikTokSync, now: freshNow }).tiktok, undefined, "non-TikTok track rejects TikTok sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, playerSync: freshSync, now: freshNow }).tiktok, undefined, "TikTok track rejects YouTube sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack, playerSync: freshTikTokSync, now: freshNow }).youtube, undefined, "YouTube track rejects TikTok sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: { ...tiktokTrack, id: "tt2", tiktokPostId: "6718335390845095174", link: "https://www.tiktok.com/@scout2015/video/6718335390845095174" }, playerSync: freshTikTokSync, now: freshNow }).tiktok, undefined, "track changes remove obsolete TikTok authority");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).tiktok, undefined, "repeated reads without sync do not fabricate zero-time TikTok sync");
assert.equal(resolveLiveOverlayScene({ currentSession: session, nowPlaying: tiktokTrack, now: freshNow }).tiktok, undefined, "second read without sync does not fabricate TikTok sync");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, updatedAt: "2099-01-01T00:00:00.000Z" }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "TikTok server stamping replaces client timestamps");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, postId: "abc" }, serverReceipt), null, "invalid TikTok post IDs are rejected");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, currentTimeSeconds: -1 }, serverReceipt), null, "negative TikTok current times are rejected");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, currentTimeSeconds: Number.NaN }, serverReceipt), null, "NaN TikTok current times are rejected");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, durationSeconds: -1 }, serverReceipt)?.durationSeconds, undefined, "invalid TikTok duration is discarded");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, scheduledStartAt: "2099-01-01T00:00:00.000Z", startToken: "client-token" }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "legacy scheduled TikTok fields are ignored during server stamping");
assert.equal(serverStampYouTubeSync({ ...freshSync, startDelayMs: 1500 }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "YouTube remains valid and ignores obsolete startDelayMs input");
assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, sponsorBreakStatus: "running" }, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow }).mode, "sponsor", "Sponsor override beats TikTok playback");
assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelOverlayActive: true }, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow }).mode, "wheel_ready", "Wheel override beats TikTok playback");
assert.equal(resolveLiveOverlayScene({ currentSession: session, overlayState: { systemMessageActive: true, systemMessage: "Hold" }, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow }).mode, "system_message", "System message override beats TikTok playback");
assert.equal(resolveLiveOverlayScene({ currentSession: session, overlayState: { systemMessageActive: false }, nowPlaying: tiktokTrack, playerSync: freshTikTokSync, now: freshNow }).tiktok?.postId, "6718335390845095173", "Clearing an override returns to synchronized TikTok when sync remains fresh");

assert.equal(serverStampYouTubeSync({ ...freshSync, updatedAt: "2099-01-01T00:00:00.000Z" }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "server receipt time replaces future client sync timestamp");
assert.equal(serverStampYouTubeSync({ ...freshSync, updatedAt: "2000-01-01T00:00:00.000Z" }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "server receipt time replaces old client sync timestamp");
assert.equal(serverStampYouTubeSync({ ...freshSync, updatedAt: "not-a-date" }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "malformed client timestamp does not break server-stamped sync");
assert.equal(serverStampYouTubeSync({ ...freshSync, updatedAt: undefined }, serverReceipt)?.updatedAt, serverReceipt.toISOString(), "missing client timestamp does not break server-stamped sync");
assert.equal(serverStampYouTubeSync({ ...freshSync, correctionReason: "state_change" }, serverReceipt)?.correctionReason, "state_change", "YouTube correctionReason accepts state_change");
assert.equal(serverStampYouTubeSync({ ...freshSync, correctionReason: "heartbeat" }, serverReceipt)?.correctionReason, "heartbeat", "YouTube correctionReason accepts heartbeat");
assert.equal(serverStampYouTubeSync({ ...freshSync, correctionReason: "seek" }, serverReceipt)?.correctionReason, "seek", "YouTube correctionReason accepts seek");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, correctionReason: "state_change" }, serverReceipt)?.correctionReason, "state_change", "TikTok correctionReason accepts state_change");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, correctionReason: "heartbeat" }, serverReceipt)?.correctionReason, "heartbeat", "TikTok correctionReason accepts heartbeat");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, correctionReason: "seek" }, serverReceipt)?.correctionReason, "seek", "TikTok correctionReason accepts seek");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, correctionReason: "bad" }, serverReceipt)?.correctionReason, undefined, "invalid correctionReason is discarded");
assert.equal(serverStampTikTokSync(freshTikTokSync, serverReceipt)?.correctionReason, undefined, "old sync without correctionReason remains valid");
assert.equal(serverStampTikTokSync({ ...freshTikTokSync, muted: false }, serverReceipt)?.muted, true, "muted remains forced true");

const nonYoutubeNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: spotifyTrack });
assert.equal(nonYoutubeNowPlaying.mode, "now_playing", "non-YouTube track resolves to artist card now playing");
assert.equal(nonYoutubeNowPlaying.youtube, undefined, "non-YouTube now playing has no YouTube player metadata");
assert.equal(nonYoutubeNowPlaying.track?.youtubePresentation, undefined, "non-YouTube resolved track has no YouTube presentation");

assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, sponsorBreakStatus: "running" }, nowPlaying: youtubeTrack }).mode, "sponsor", "sponsor running beats YouTube now playing");

const wheelWaiting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 2 }, nowPlaying: youtubeTrack });
assert.equal(wheelWaiting.mode, "now_playing", "wheel owed does not auto-launch wheel scene");
assert.equal(wheelWaiting.wheelSpinsOwed, 2, "wheel owed count remains available for admin notification");

assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelOverlayActive: true }, nowPlaying: youtubeTrack }).mode, "wheel_ready", "launched wheel overlay resolves to wheel ready");
assert.equal(resolveLiveOverlayScene({ currentSession: session, overlayState: { wheelOverlayActive: false }, nowPlaying: youtubeTrack }).mode, "now_playing", "cleared wheel overlay returns to automatic now playing");

const system = resolveLiveOverlayScene({ currentSession: session, overlayState: { systemMessageActive: true, systemMessageTitle: "BRB", systemMessage: "Technical reset." }, nowPlaying: youtubeTrack });
assert.equal(system.mode, "system_message", "temporary system message overrides YouTube now playing");
assert.equal(system.title, "BRB");

const unsafe = resolveLiveOverlayScene({ currentSession: session, nowPlaying: { id: "bad1", submittedArtistName: "Unsafe", submittedSongTitle: "Private", sourceType: "youtube", sourceArtworkUrl: "https://foo.private.blob.vercel-storage.com/barcode-radio-queue/secret.png", link: "https://bit.ly/abcdefghijk", durationLabel: "5:00" } });
assert.equal(unsafe.mode, "now_playing", "unsafe YouTube-like track still falls back to public-safe now playing card");
assert.equal(unsafe.youtube, undefined, "unsafe/shortened link does not produce YouTube player metadata");
assert.equal(unsafe.sourceUrl, null, "unsafe link is not exposed");
assert.equal(unsafe.artworkUrl, null, "private blob artwork is not exposed");

const adminPanel = readFileSync("src/components/AdminLiveOverlayControl.tsx", "utf8");
const adminQueueControl = readFileSync("src/components/AdminRadioQueueControl.tsx", "utf8");
const liveOverlayController = readFileSync("src/lib/live-overlay.ts", "utf8");
assert.equal(adminPanel.includes("Show Now Playing"), false, "admin panel does not expose normal manual scene picker");
assert.equal(adminPanel.includes("Temporary System Message") && adminPanel.indexOf("Temporary System Message") > adminPanel.indexOf("<details"), true, "temporary system message is inside collapsed emergency details");
assert.equal(adminPanel.includes("selectedWheelTrackId") && adminPanel.includes("Choose winning track") && adminPanel.includes("selectedTrackId"), true, "admin panel provides a grouped winner track picker before confirming Wheel Chosen");
assert.equal(adminQueueControl.includes("useCallback(async (playbackState") && !adminQueueControl.includes("}, [entry, videoId])"), true, "admin YouTube publish callback does not depend on the full entry object");
assert.equal(adminQueueControl.includes("useMemo<OverlayYouTubeTrackInput>") && adminQueueControl.includes("[trackId, trackLink, sourceType, videoId]"), true, "admin YouTube sync input uses stable primitive dependencies for refreshed queue objects");
assert.equal(adminQueueControl.includes("playbackStateRef.current === \"playing\" || playbackStateRef.current === \"paused\""), true, "admin YouTube heartbeat publishes while playing and paused");
assert.equal(adminQueueControl.includes("Stopped/ended publishes immediately") && adminQueueControl.includes("falls back after staleness"), true, "stopped YouTube sync behavior is documented");
assert.equal(adminQueueControl.includes("onError: (event: { data: number })") && adminQueueControl.includes("youtubeErrorLabel"), true, "admin YouTube player records controlled IFrame error diagnostics");
assert.equal(adminQueueControl.includes("playerHostRef") && adminQueueControl.includes("document.createElement(\"div\")") && adminQueueControl.includes("new yt.Player(mount"), true, "admin YouTube player uses an empty imperative host instead of a React-managed target child");
assert.equal(adminQueueControl.includes("clearImperativeHost") && adminQueueControl.includes("replaceChildren()"), true, "admin YouTube cleanup clears YouTube-owned descendants imperatively and idempotently");
assert.equal(adminQueueControl.includes("YOUTUBE_PLAYER_READY_TIMEOUT_MS") && adminQueueControl.includes("window.setTimeout"), true, "admin YouTube player has a readiness watchdog");
assert.equal(adminQueueControl.includes("Open Wheel Panel") || adminQueueControl.includes("Open Wheel"), true, "top bar and wheel CTA expose an Open Wheel action when spins are owed");
assert.equal(adminQueueControl.includes("Live Overlay — Wheel Owed"), true, "live overlay utility copy clearly signals owed wheel state");
assert.equal(adminPanel.includes("Next Action:"), true, "wheel section includes a next action summary for hosts");
assert.equal(adminQueueControl.includes("top-bar Spin Wheel"), false, "top bar does not include dangerous Spin Wheel action");
assert.equal(adminQueueControl.includes("top-bar Confirm Wheel"), false, "top bar does not include dangerous Confirm Wheel action");
assert.equal(adminQueueControl.includes("top-bar Winner Not Here"), false, "top bar does not include dangerous Winner Not Here action");
assert.equal(liveOverlayController.includes("submitterIdentityKeys") && liveOverlayController.includes("trackCount") && liveOverlayController.includes("findTrackInWinnerGroup"), true, "wheel controller groups candidates by submitter identity and resolves grouped winners to a selected track");

const receiver = readFileSync("src/components/LiveOverlayReceiver.tsx", "utf8");
const overlayApiRoute = readFileSync("src/app/api/overlay/live/route.ts", "utf8");
const overlayCss = readFileSync("src/app/overlay/live/overlay-live.css", "utf8");
assert.equal(receiver.includes("serverRelativeSyncAgeSeconds") && receiver.includes("performance.now() - clockAnchor.receivedAtPerformanceMs"), true, "receiver uses server-relative monotonic sync age instead of browser wall-clock age");
assert.equal(receiver.includes("latestSyncRef") && !receiver.includes("initialSyncRef"), true, "YouTube receiver uses latest sync instead of frozen mount-time sync");
assert.equal(receiver.includes("applyYouTubeSync(latestSyncRef.current)"), true, "YouTube receiver applies the latest sync from onReady");
assert.equal(receiver.includes("playerVars: { autoplay: 0") && receiver.includes("player.cueVideoById") && receiver.includes("player.pauseVideo()"), true, "YouTube receiver initializes paused/stopped sync without autoplay");
assert.equal(receiver.includes("YOUTUBE_BEHIND_THRESHOLD_SECONDS = 0.20") && receiver.includes("YOUTUBE_AHEAD_THRESHOLD_SECONDS = 0.70") && receiver.includes("YOUTUBE_PAUSED_DRIFT_THRESHOLD_SECONDS = 0.25"), true, "YouTube receiver uses directional provider-specific drift thresholds before seeking");
assert.equal(receiver.includes("player.loadVideoById({ videoId: nextSync.videoId") && receiver.includes("loadedVideoRef.current !== nextSync.videoId"), true, "YouTube receiver only reloads when sync video changes after initial load");
assert.equal(receiver.includes("requestSeq") && receiver.includes("latestAppliedSeq") && receiver.includes("AbortController") && receiver.includes("window.setTimeout(poll"), true, "overlay polling is ordered, single-flight, and timeout-driven");
assert.equal(receiver.includes("const appliedScene = nextScene ?? sceneRef.current") && receiver.includes("setScene(appliedScene)") && receiver.includes("setConnected(false)"), true, "overlay polling failure preserves the last known good scene while signaling hold");
assert.equal(overlayApiRoute.includes("const serverRequestReceivedAt = new Date()") && overlayApiRoute.includes("const scene = await getResolvedLiveOverlayScene()") && overlayApiRoute.includes("const serverNow = new Date()") && overlayApiRoute.indexOf("const serverRequestReceivedAt = new Date()") < overlayApiRoute.indexOf("const scene = await getResolvedLiveOverlayScene()") && overlayApiRoute.indexOf("const scene = await getResolvedLiveOverlayScene()") < overlayApiRoute.indexOf("const serverNow = new Date()"), true, "public overlay API returns scene with request receipt and generates serverNow after scene resolution");
assert.equal(overlayApiRoute.includes("Cache-Control") && overlayApiRoute.includes("no-store"), true, "public overlay API keeps no-store cache control");
assert.equal(receiver.includes("const serverClockAnchorRef = useRef<OverlayServerClockAnchor | null>(null)") && !receiver.includes("const [serverClockAnchor, setServerClockAnchor]"), true, "LiveOverlayReceiver retains a stable clock-anchor ref and does not store the full anchor in state");
assert.equal(receiver.includes("const [serverClockAnchored, setServerClockAnchored] = useState(false)") && receiver.includes("setServerClockAnchored((current) => current === nextAnchored ? current : nextAnchored)"), true, "only a boolean anchored status is stored in state and same-value updates are avoided");
assert.equal(receiver.includes("const serverRequestReceivedAtMs = typeof next?.serverRequestReceivedAt === \"string\"") && receiver.includes("const serverNowMs = typeof next?.serverNow === \"string\"") && receiver.includes("responseTransitEstimateMs: responseTransitEstimateMsRef.current ?? 0") && receiver.includes("serverClockAnchorRef.current = clockAnchor") && receiver.indexOf("serverClockAnchorRef.current = clockAnchor") < receiver.indexOf("setScene(appliedScene)"), true, "poll validates server timing and anchors before applying scene");
assert.equal(receiver.includes("onError: (event: { data: number })") && receiver.includes("live-overlay-youtube-fallback"), true, "overlay YouTube errors render a controlled track-card fallback");
assert.equal(receiver.includes("playerHostRef") && receiver.includes("document.createElement(\"div\")") && receiver.includes("new window.YT.Player(mount"), true, "overlay YouTube player uses an empty imperative host instead of its React component root");
assert.equal(receiver.includes("data-youtube-wrapper") && receiver.includes("playerError && <div className=\"live-overlay-youtube-fallback\""), true, "overlay YouTube fallback stays inside the stable React-owned wrapper");
assert.equal(receiver.includes("failedVideoRef.current = failedVideoRef.current === latestSyncRef.current.videoId ? failedVideoRef.current : null"), true, "overlay clears the previous failed-video marker for a different video");
assert.equal(receiver.includes("failedVideoRef.current === nextSync.videoId") && receiver.includes("failedVideoRef.current === latestSyncRef.current.videoId"), true, "overlay does not recreate the same failed video on every poll");
assert.equal(receiver.includes("YOUTUBE_OVERLAY_READY_TIMEOUT_MS") && receiver.includes("markPlayerUnavailable"), true, "overlay YouTube player has a readiness watchdog and controlled fallback");
assert.equal(receiver.includes('scene.track?.youtubePresentation === "short"') && receiver.includes('live-overlay-youtube-scene--short'), true, "receiver applies the Shorts modifier only for short presentation");
assert.equal(receiver.includes('const youtubeSceneClass = shortYouTube ? "live-overlay-youtube-scene live-overlay-youtube-scene--short" : "live-overlay-youtube-scene"'), true, "standard YouTube keeps the normal scene class");
assert.equal(receiver.includes("<YouTubeOverlayPlayer sync={scene.youtube} clockAnchorRef={serverClockAnchorRef} clockAnchored={serverClockAnchored} responseTransitMs=") && receiver.includes("data-overlay-response-transit-ms={responseTransitMs ?? undefined}"), true, "YouTubeOverlayPlayer receives the stable clock-anchor ref plus boolean and response-transit diagnostics");
assert.equal(receiver.includes("clockAnchorRef={serverClockAnchorRef}") && receiver.includes("clockAnchored={serverClockAnchored}") && receiver.includes("responseTransitMs={responseTransitDiagnosticMs}") && receiver.includes("function TikTokOverlayPlayer({ sync, artistName, trackTitle, clockAnchorRef, clockAnchored, responseTransitMs }"), true, "TikTokOverlayPlayer receives the stable clock-anchor ref plus boolean and response-transit diagnostics");
assert.equal(receiver.includes('className="live-overlay-youtube-viewport"'), true, "YouTube scene uses the dedicated viewport wrapper");
assert.equal(receiver.includes('className="live-overlay-youtube-lower"') && receiver.includes('<p className="live-overlay-mode">{label}</p>') && receiver.includes('<h1>{scene.track.artistName}</h1>') && receiver.includes('<h2>{scene.track.trackTitle}</h2>'), true, "YouTube scene uses a separate information rail with only now playing, artist, and title copy");
assert.equal(overlayCss.includes('.live-overlay-youtube-viewport') && overlayCss.includes('position: absolute') && overlayCss.includes('inset: 0'), true, "standard YouTube retains the current full-frame viewport and lower-third behavior");
assert.equal(overlayCss.includes('.live-overlay-youtube-scene--short .live-overlay-youtube-lower') && overlayCss.includes('position: relative') && overlayCss.includes('left: auto') && overlayCss.includes('bottom: auto'), true, "Shorts lower block is not absolutely positioned over the player");
assert.equal(overlayCss.includes('aspect-ratio: 9 / 16'), true, "Shorts viewport uses aspect-ratio: 9 / 16");
assert.equal(overlayCss.includes('overflow-wrap: anywhere') && overlayCss.includes('min-width: 0') && overlayCss.includes('hyphens: auto'), true, "long Shorts rail text wraps inside the rail");
assert.equal(receiver.includes("generationRef") && receiver.includes("destroyedRef") && receiver.includes("try {") && receiver.includes("playerRef.current?.destroy?.()"), true, "overlay YouTube player guards operations and ignores obsolete callbacks");
assert.equal(receiver.includes("Click to spin"), false, "public wheel overlay does not include stock click-to-spin text");
assert.equal(receiver.includes("ctrl+enter"), false, "public wheel overlay does not include stock keyboard shortcut text");
assert.equal(receiver.includes("live-overlay-wheel-roster"), false, "public wheel overlay does not render the previous bottom roster/control clutter");
assert.equal(receiver.includes(`!wheelVisible && <div className="live-overlay-footer"`), true, "public wheel ceremony hides the generic overlay footer");
assert.equal(receiver.includes("live-overlay-wheel-slice-label"), true, "public wheel overlay renders candidate names as slice labels");
assert.equal(receiver.includes("#7c3aed") && receiver.includes("#facc15") && receiver.includes("#22c55e"), true, "wheel slice palette includes expanded BARCODE colors");
assert.equal(receiver.includes("wheelLabelMetrics") && receiver.includes("wheelLabelFit") && receiver.includes("--wheel-name-size") && receiver.includes("--wheel-label-width") && receiver.includes("--wheel-label-x") && receiver.includes("--wheel-label-rotation"), true, "wheel artist labels use per-name dynamic sizing and slice-body placement variables");
assert.equal(receiver.includes("Winner selection is based on slice geometry") && receiver.includes("finalRotationDeg") && receiver.includes("live-overlay-wheel-winning-segment"), true, "wheel receiver documents labels as visual-only, uses stored landing rotation, and renders a segment highlight");
assert.equal(overlayCss.includes("live-overlay-wheel-scene--result_pending .live-overlay-wheel") && overlayCss.includes("transform: rotate(var(--wheel-final-rotation"), true, "result state preserves the stored wheel rotation instead of snapping after spin");
assert.equal(receiver.includes("Re-encrypting Signal") || receiver.includes("RE-ENCRYPTING"), true, "receiver has re-encryption ceremony copy");
assert.equal(receiver.includes("data-wheel-animation-key") && receiver.includes("reencryptNonce") && receiver.includes("key={`glitch-${animationKey}`}"), true, "receiver keys the glitch animation layer by nonce so re-encryption visibly remounts and replays every time");
assert.equal(liveOverlayController.includes("wheelCeremonyPreviousCandidateOrder") && liveOverlayController.includes("wheelCeremonyReencryptNonce") && liveOverlayController.includes("derangedWheelCandidateOrder"), true, "wheel controller persists previous order plus a fresh re-encryption nonce and deranged order on each re-encrypt click");
assert.equal(liveOverlayController.includes("wheelCeremonyFinalRotationDeg") && liveOverlayController.includes("wheelCeremonyLandingAngleDeg") && liveOverlayController.includes("wheelCeremonyWinningSegmentIndex") && liveOverlayController.includes("wheelFinalRotationForSegment"), true, "spin action stores one final landing rotation contract with segment metadata before the overlay spins");
const submitterIdentitySource = liveOverlayController.slice(liveOverlayController.indexOf("function submitterIdentityKeys"), liveOverlayController.indexOf("export function getWheelCandidatesFromQueue"));
assert.equal(submitterIdentitySource.includes("submitterToken") && submitterIdentitySource.includes("submitterId") && submitterIdentitySource.includes("accountId") && submitterIdentitySource.includes("normalizedTikTokHandle") && submitterIdentitySource.includes("contactEmail"), true, "wheel controller groups by stable submitter identity before falling back to name");
assert.equal(submitterIdentitySource.includes("submittedSongTitle"), false, "submitter identity grouping does not use song titles as grouping keys");
assert.equal(liveOverlayController.includes("queue.filter(isWheelEligibleTrack)") && liveOverlayController.includes("trackCount") && liveOverlayController.includes("tracks: [track]"), true, "wheel grouping starts from eligible regular tracks and preserves one grouped person entry with track choices");
assert.equal(overlayCss.includes("width: min(92.5vmin, 100%)"), true, "wheel is sized to dominate the square overlay");
assert.equal(overlayCss.includes("live-wheel-reencrypt-sweep") && overlayCss.includes("live-wheel-reencrypt-brew") && overlayCss.includes("live-wheel-pointer-pulse"), true, "wheel ceremony CSS includes brewing re-encryption and pointer polish effects");
assert.equal(overlayCss.includes("\"Arial Black\"") && overlayCss.includes("live-overlay-wheel::before") && overlayCss.includes("radial-gradient(ellipse at center"), true, "wheel CSS includes BARCODE-style typography, rim detailing, and integrated label glow");

const eligibleCandidates = [
  { id: "free-1", submittedArtistName: "Free Artist", submittedSongTitle: "Free Track" },
  { id: "free-2", submittedArtistName: "Second Artist", submittedSongTitle: "Second Track" },
];
const notLaunched = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, nowPlaying: spotifyTrack, wheelCandidates: eligibleCandidates });
assert.equal(notLaunched.mode, "now_playing", "wheel owed with candidates still does not auto-spin before launch");
assert.equal(notLaunched.wheelCeremony, undefined, "wheel ceremony state is absent until host launch");

const launched = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonyStartedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, nowPlaying: spotifyTrack });
assert.equal(launched.mode, "wheel_ready", "launched wheel resolves to ready scene");
assert.equal(launched.wheelCeremony?.candidateCount, 2, "ready scene exposes safe eligible candidate count");
assert.equal(launched.automatic, false, "launched wheel is host-controlled visual state");

const groupedCandidate = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonySeed: "grouped-a" }, wheelCandidates: [{ id: "person:melanie", artistName: "Melanie", trackTitle: "3 eligible tracks", trackIds: ["m1", "m2", "m3"], trackCount: 3, tracks: [{ id: "m1", artistName: "Melanie", trackTitle: "First" }, { id: "m2", artistName: "Melanie", trackTitle: "Second" }, { id: "m3", artistName: "Melanie", trackTitle: "Third" }] }], nowPlaying: spotifyTrack });
assert.equal(groupedCandidate.wheelCeremony?.candidateCount, 1, "grouped person appears once on the wheel");
assert.equal(groupedCandidate.wheelCeremony?.displayCandidates[0]?.trackCount, 3, "grouped wheel entry preserves eligible track count");

const spinning = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:03.000Z") });
assert.equal(spinning.mode, "wheel_spinning", "spin scene stays spinning during the visual spin window");
assert.equal(spinning.wheelCeremony?.resultTrack?.id, "free-2", "server-selected result is stored while visual spin runs");

const pendingResult = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:25.000Z") });
assert.equal(pendingResult.mode, "wheel_result", "spinning ceremony becomes result pending after spin duration");
assert.equal(pendingResult.wheelCeremony?.status, "result_pending", "computed ceremony status waits for host confirmation");

const frozenSpinOrder = ["free-2", "free-1"];
const frozenSegments = buildWheelSegments(frozenSpinOrder.map((candidateId) => ({ id: candidateId, label: candidateId })));
const frozenWinnerSegment = frozenSegments.find((segment) => segment.candidateId === "free-2");
const frozenFinalRotation = wheelFinalRotationForSegment(frozenWinnerSegment);
const storedRotationSpin = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyCandidateOrder: frozenSpinOrder, wheelCeremonyFinalRotationDeg: frozenFinalRotation, wheelCeremonyLandingAngleDeg: frozenWinnerSegment.centerAngle, wheelCeremonyWinningSegmentId: frozenWinnerSegment.id, wheelCeremonyWinningSegmentIndex: frozenWinnerSegment.index }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:03.000Z") });
const storedRotationResult = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyCandidateOrder: frozenSpinOrder, wheelCeremonyFinalRotationDeg: frozenFinalRotation, wheelCeremonyLandingAngleDeg: frozenWinnerSegment.centerAngle, wheelCeremonyWinningSegmentId: frozenWinnerSegment.id, wheelCeremonyWinningSegmentIndex: frozenWinnerSegment.index }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:25.000Z") });
assert.deepEqual(storedRotationSpin.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), frozenSpinOrder, "spinning scene draws the frozen display order used for winner math");
assert.deepEqual(storedRotationResult.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), frozenSpinOrder, "result scene keeps the same frozen display order after the spin");
assert.equal(storedRotationResult.wheelCeremony?.finalRotationDeg, frozenFinalRotation, "result pending keeps the stored final rotation without recomputing after spin");
assert.equal(wheelSegmentAtPointer(frozenSegments, storedRotationResult.wheelCeremony?.finalRotationDeg, WHEEL_RIGHT_POINTER_ANGLE_DEGREES).candidateId, "free-2", "stored final rotation still places the selected frozen segment under the right-side pointer");
assert.equal(storedRotationResult.wheelCeremony?.winningSegmentIndex, frozenWinnerSegment.index, "spin/result contract exposes the winning segment index used to calculate landing rotation");

const derangedTwo = derangedWheelCandidateOrder([{ id: "a" }, { id: "b" }], ["a", "b"], "nonce-2");
assert.deepEqual(derangedTwo, ["b", "a"], "two wheel candidates swap positions during re-encrypt");
for (const count of [5, 10]) {
  const previousOrder = Array.from({ length: count }, (_, index) => `candidate-${index}`);
  const derangedOrder = derangedWheelCandidateOrder(previousOrder.map((id) => ({ id })), previousOrder, `nonce-${count}`);
  assert.equal(derangedOrder.length, previousOrder.length, `${count} candidate derangement preserves candidate count`);
  assert.equal(derangedOrder.every((candidateId, index) => candidateId !== previousOrder[index]), true, `${count} candidate derangement moves every candidate to a new index`);
}
assert.deepEqual(derangedWheelCandidateOrder([{ id: "solo" }], ["solo"], "nonce-1"), ["solo"], "single candidate remains in place but can still receive an animation nonce");

const timingCandidates = [
  { id: "alpha", submittedArtistName: "Alpha", submittedSongTitle: "One" },
  { id: "bravo", submittedArtistName: "Bravo", submittedSongTitle: "Two" },
  { id: "charlie", submittedArtistName: "Charlie", submittedSongTitle: "Three" },
];
const previousOrder = ["alpha", "bravo", "charlie"];
const currentOrder = derangedWheelCandidateOrder(timingCandidates, previousOrder, "nonce-a");
assert.equal(currentOrder.every((candidateId, index) => candidateId !== previousOrder[index]), true, "test re-encrypt order visibly moves every candidate");

const previousOrderReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonyCandidateOrder: previousOrder }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.000Z") });
const currentOrderReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonyCandidateOrder: currentOrder }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.000Z") });

const reencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyCandidateOrder: currentOrder, wheelCeremonyPreviousCandidateOrder: previousOrder, wheelCeremonyReencryptNonce: "nonce-a" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.300Z") });
assert.equal(reencrypting.mode, "wheel_reencrypting", "re-encrypting ceremony shows re-encryption scene first");
assert.equal(reencrypting.subtitle, "RE-ENCRYPTING SIGNAL", "re-encrypting scene uses BARCODE-controlled copy");
assert.equal(reencrypting.wheelCeremony?.reencryptNonce, "nonce-a", "first re-encrypt exposes animation nonce to the overlay");
assert.deepEqual(reencrypting.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), previousOrderReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "early re-encrypt keeps the previous clean mapping visible before the obscured remap point");

const secondReencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:10.000Z", wheelCeremonyCandidateOrder: previousOrder, wheelCeremonyPreviousCandidateOrder: currentOrder, wheelCeremonyReencryptNonce: "nonce-b" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:10.300Z") });
const thirdReencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:20.000Z", wheelCeremonyCandidateOrder: currentOrder, wheelCeremonyPreviousCandidateOrder: previousOrder, wheelCeremonyReencryptNonce: "nonce-c" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:20.300Z") });
assert.deepEqual(new Set([reencrypting.wheelCeremony?.reencryptNonce, secondReencrypting.wheelCeremony?.reencryptNonce, thirdReencrypting.wheelCeremony?.reencryptNonce]).size, 3, "first, second, and third re-encrypt nonces are all unique");

const remappedDuringGlitch = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyCandidateOrder: currentOrder, wheelCeremonyPreviousCandidateOrder: previousOrder, wheelCeremonyReencryptNonce: "nonce-a" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(remappedDuringGlitch.mode, "wheel_reencrypting", "re-encrypt remains visually glitching after the remap point");
assert.deepEqual(remappedDuringGlitch.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), currentOrderReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "re-encrypt switches to the new mapping while the glitch state is still active");

const reencryptedReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyCandidateOrder: currentOrder, wheelCeremonyPreviousCandidateOrder: previousOrder, wheelCeremonyReencryptNonce: "nonce-a" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:02.300Z") });
assert.equal(reencryptedReady.mode, "wheel_ready", "re-encrypting ceremony returns to ready without selecting a winner");
assert.equal(reencryptedReady.wheelCeremony?.resultTrackId, undefined, "re-encrypting does not produce a final winner");
assert.equal(reencryptedReady.wheelSpinsOwed, 1, "re-encrypting does not consume the owed wheel spin");
assert.deepEqual(reencryptedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), currentOrderReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "ready state resolves with the remapped names after the glitch clears");

const signalLost = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "signal_lost", wheelOverlayActive: true, wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(signalLost.mode, "wheel_ready", "legacy winner-not-here recovery stays in the wheel-ready scene");
assert.equal(signalLost.subtitle, "SIGNAL LOST", "legacy winner-not-here recovery can still show signal-lost copy");

const winnerNotHereReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(winnerNotHereReady.mode, "wheel_ready", "winner-not-here recovery returns the ceremony to ready state");
assert.equal(winnerNotHereReady.subtitle, "READY", "winner-not-here recovery exposes ready controls again");

const confirmedFresh = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 0 }, overlayState: { wheelCeremonyStatus: "confirmed", wheelOverlayActive: true, wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(confirmedFresh.mode, "wheel_confirmed", "fresh confirmed result shows lock-in scene");

const confirmedExpired = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 0 }, overlayState: { wheelCeremonyStatus: "confirmed", wheelOverlayActive: true, wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, nowPlaying: spotifyTrack, now: new Date("2026-05-14T00:00:04.000Z") });
assert.equal(confirmedExpired.mode, "now_playing", "confirmed scene automatically returns to normal resolver after lock-in window");

const cancelled = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "cancelled", wheelOverlayActive: false }, wheelCandidates: eligibleCandidates, nowPlaying: spotifyTrack });
assert.equal(cancelled.mode, "now_playing", "cancelled wheel returns to automatic overlay mode without a wheel scene");

console.log("live overlay resolver tests passed");

const sourceAdmin = readFileSync("src/components/AdminRadioQueueControl.tsx", "utf8");
const sourceReceiver = readFileSync("src/components/LiveOverlayReceiver.tsx", "utf8");
const sourceCss = readFileSync("src/app/overlay/live/overlay-live.css", "utf8");
const sourcePublicOverlayRoute = readFileSync("src/app/api/overlay/live/route.ts", "utf8");
const sourceAdminOverlayRoute = readFileSync("src/app/api/admin/overlay/live/route.ts", "utf8");
const sourceLiveOverlay = readFileSync("src/lib/live-overlay.ts", "utf8");
const adminPostSource = sourceAdminOverlayRoute.slice(sourceAdminOverlayRoute.indexOf("export async function POST"));
assert.equal(adminPostSource.includes("const serverRequestReceivedAt = new Date()") && adminPostSource.indexOf("const serverRequestReceivedAt = new Date()") < adminPostSource.indexOf("assertAdmin"), true, "admin POST captures request receipt before auth/action processing");
assert.equal(sourceAdminOverlayRoute.includes("X-BNL-Request-Received-At") && sourceAdminOverlayRoute.includes("X-BNL-Response-Generated-At"), true, "admin POST success/controlled responses contain timing headers");
assert.equal(sourceAdminOverlayRoute.includes('"Cache-Control": "no-store"'), true, "admin Cache-Control remains no-store");
assert.equal(sourceAdminOverlayRoute.includes("setLiveOverlayState(body, serverRequestReceivedAt)") && sourceLiveOverlay.includes("setLiveOverlayState(payload: LiveOverlayPayload, receivedAt?: Date)") && sourceLiveOverlay.includes("setLiveOverlayPlayerSync(normalizePlayerSync(payload.sync, receivedAt), receivedAt ?? new Date(now))"), true, "updatePlayerSync receives the route receipt Date for authoritative server stamping");
assert.equal(sourcePublicOverlayRoute.includes("serverRequestReceivedAt") && sourcePublicOverlayRoute.includes("serverNow") && sourcePublicOverlayRoute.includes('"Cache-Control": "no-store"'), true, "public GET returns serverRequestReceivedAt, serverNow, scene, and no-store");
assert.equal(!sourceAdmin.includes("estimatedOneWayLatencySeconds"), true, "old raw latency helper is absent from admin media time");
assert.equal(sourceAdmin.includes("outboundTransitEstimateMsRef") && sourceAdmin.includes('playbackState === "playing" ? (outboundTransitEstimateMsRef.current ?? 0) / 1000 : 0'), true, "YouTube/TikTok playing publications use previous bounded outbound transit only while playing");
assert.equal(sourceAdmin.includes("projected + outboundTransitSeconds") && sourceAdmin.includes('playbackState === "playing" ? projected + outboundTransitSeconds : observedTimeSeconds'), true, "TikTok playing publication adds transit after official-time projection");
assert.equal(sourceAdmin.includes("estimateOneWayNetworkTransitMs(responseReceivedAtPerformanceMs - requestStartedAtPerformanceMs, serverProcessingMs)") && sourceAdmin.includes("updateTransitEstimateMs(outboundTransitEstimateMsRef.current, outboundTransitMs)"), true, "admin publishing measures processing-adjusted transport and stores a bounded EMA");
assert.equal(sourceAdmin.includes("observedAtMs?: number") && sourceAdmin.includes("current.observedAtMs") && sourceAdmin.includes("publish(pendingState, currentTime, pendingReason, nowMs)") && sourceAdmin.includes('publish(lastStablePlaybackStateRef.current, currentTime, "seek", nowMs)'), true, "queued TikTok publications retain currentTime and observedAt as matched pairs");
assert.equal(sourceAdmin.includes("buildOverlayTikTokSync") && sourceAdmin.includes("parseTikTokVideoUrl(entry.link)") && sourceAdmin.includes("postId: parsedPostId"), true, "Admin TikTok publisher uses the validated post ID");
assert.equal(sourceAdmin.includes("value.currentTime") && sourceAdmin.includes("value.duration"), true, "Admin publisher uses official event.data.value");
assert.equal(sourceAdmin.includes('type === "onPlayerReady"') && sourceAdmin.includes('type === "onStateChange"') && sourceAdmin.includes('type === "onCurrentTime"') && sourceAdmin.includes('type === "onMute"') && sourceAdmin.includes('type === "onVolumeChange"'), true, "Admin handles official ready/state/current-time/mute/volume transitions");
assert.equal(!sourceAdmin.includes('publishStable("stopped")') && !sourceAdmin.includes('publishStable("playing")'), true, "onPlayerReady does not publish stopped or synthetic playing sync");
assert.equal(sourceAdmin.includes("hasObservedCurrentTimeRef") && sourceAdmin.includes("pendingPlaybackStateRef"), true, "Admin state waits for official current-time evidence");
assert.equal(sourceAdmin.includes('pendingPlaybackStateRef.current = "playing"') || sourceAdmin.includes("pendingPlaybackStateRef.current = state"), true, "Pending playing publishes after valid onCurrentTime");
assert.equal(sourceAdmin.includes("const pendingState = pendingPlaybackStateRef.current") && sourceAdmin.includes("publish(pendingState, currentTime, pendingReason, nowMs)"), true, "Pending paused/stopped state publishes after valid onCurrentTime");
assert.equal(sourceAdmin.includes("currentTime < 0") && sourceAdmin.includes("Number.isFinite(currentTime)"), true, "Observed currentTime zero is accepted while negative/NaN are rejected");
assert.equal(sourceAdmin.includes("window.setInterval") && sourceAdmin.includes("TIKTOK_SYNC_HEARTBEAT_MS") && sourceAdmin.includes("hasObservedCurrentTimeRef.current") && sourceAdmin.includes('lastStablePlaybackStateRef.current === "paused"'), true, "Heartbeats require observed current time and run while playing/paused");
assert.equal(!sourceAdmin.includes('lastStablePlaybackStateRef.current === "stopped")) void publish'), true, "Stopped state is not heartbeated");
assert.equal(sourceAdmin.indexOf('if (entry.sourceType !== "youtube") await clearOverlayPlayerSync()') < sourceAdmin.indexOf('const updated = await action(entry.id, "load")'), true, "Old sync clears before non-YouTube load mutation");
assert.equal(!sourceAdmin.includes('if (updated?.nowPlaying?.id === entry.id) {\n      if (entry.sourceType !== "youtube") await clearOverlayPlayerSync();'), true, "No later non-YouTube clear race remains");
assert.equal(!sourceAdmin.includes("PR #248 cleanup retained") && !sourceAdmin.includes("PR #248 lifecycle dependencies retained"), true, "Test-shaping PR #248 comments were removed");
assert.equal(sourceReceiver.includes("const localTimeRef = useRef<number>(Number.NaN)"), true, "localTimeRef initializes to Number.NaN");
assert.equal(sourceReceiver.includes("localTimeRef.current = Number.NaN"), true, "lifecycle resets localTimeRef to Number.NaN");
assert.equal(sourceReceiver.includes("const confirmedLocalTime =") && sourceReceiver.includes("!playbackConfirmedRef.current") && sourceReceiver.includes("sendTikTokSeekCommand(seekTarget)"), true, "First synchronization seeks only when projected local time is unavailable or materially wrong");
assert.equal(sourceReceiver.includes("Math.min(expected, sync.durationSeconds)"), true, "Expected position clamps to valid duration");
const expectedYoutubeSource = sourceReceiver.slice(sourceReceiver.indexOf("function expectedYouTubeTime"), sourceReceiver.indexOf("function ensureYouTubeApi"));
const expectedTikTokSource = sourceReceiver.slice(sourceReceiver.indexOf("function expectedTikTokTime"), sourceReceiver.indexOf("function tiktokSyncRevision"));
assert.equal(expectedYoutubeSource.includes("serverRelativeAgeFromAnchor") && expectedYoutubeSource.includes("sync.currentTimeSeconds + ageSeconds") && !expectedYoutubeSource.includes("Date.now()"), true, "YouTube expected time uses corrected server-relative age and not browser Date.now");
assert.equal(expectedTikTokSource.includes("serverRelativeAgeFromAnchor(sync.updatedAt") && !expectedTikTokSource.includes("scheduledStartAt") && !expectedTikTokSource.includes("Date.now()"), true, "TikTok expected time uses updatedAt for ordinary sync without scheduled-start branches");
assert.equal(sourceReceiver.includes("expectedYouTubeTime(nextSync, clockAnchorRef.current)") && sourceReceiver.includes("expectedTikTokTime(nextSync, clockAnchorRef.current)"), true, "provider sync reads clockAnchorRef.current at apply time");
assert.equal(sourceReceiver.includes("requestStartedAtPerformanceMs = performance.now()") && sourceReceiver.includes("responseReceivedAtPerformanceMs = performance.now()") && sourceReceiver.includes("serverNowMs - serverRequestReceivedAtMs") && sourceReceiver.includes("estimateOneWayNetworkTransitMs(responseReceivedAtPerformanceMs - requestStartedAtPerformanceMs, serverProcessingMs)") && sourceReceiver.includes("responseTransitEstimateMsRef.current = updateTransitEstimateMs"), true, "receiver poll measures processing-adjusted response transit with monotonic timing and bounded smoothing");
assert.equal(sourceReceiver.includes("responseTransitEstimateMs") && sourceReceiver.includes("serverNowMs + clockAnchor.responseTransitEstimateMs"), true, "server-relative age includes response transit estimate from the stable anchor");
assert.equal(!sourceReceiver.includes("YOUTUBE_PLAYING_DRIFT_THRESHOLD_SECONDS") && !sourceReceiver.includes("TIKTOK_PLAYING_DRIFT_THRESHOLD_SECONDS"), true, "provider receivers no longer use one symmetric playing threshold");
assert.equal(sourceReceiver.includes("YOUTUBE_BEHIND_THRESHOLD_SECONDS = 0.20") && sourceReceiver.includes("TIKTOK_BEHIND_THRESHOLD_SECONDS = 0.30"), true, "behind corrections use smaller provider-specific thresholds");
assert.equal(sourceReceiver.includes("YOUTUBE_AHEAD_THRESHOLD_SECONDS = 0.70") && sourceReceiver.includes("TIKTOK_AHEAD_THRESHOLD_SECONDS = 0.85"), true, "ahead thresholds remain wider for provider stability");
assert.equal(sourceReceiver.includes("YOUTUBE_MAX_CATCH_UP_SECONDS = 0.20") && sourceReceiver.includes("TIKTOK_MAX_CATCH_UP_SECONDS = 0.30") && sourceReceiver.includes("playbackCorrectionTarget"), true, "behind corrections use bounded proportional catch-up");
assert.equal(sourceReceiver.includes("shouldCorrectPlaybackDrift") && !sourceReceiver.includes("Math.abs(drift) > threshold"), true, "receiver uses directional drift helper instead of symmetric absolute threshold checks");
assert.equal(sourceReceiver.includes("data-youtube-drift-direction") && sourceReceiver.includes("data-tiktok-drift-direction") && sourceReceiver.includes("data-youtube-correction-target") && sourceReceiver.includes("data-tiktok-correction-target"), true, "safe drift direction and correction target attributes exist");
assert.equal(!sourceReceiver.includes("fixedProviderOffset") && !sourceReceiver.includes("GLOBAL_OFFSET"), true, "no new fixed global provider offset exists");
assert.equal(sourceReceiver.includes("expectedTikTokTime(latestSyncRef.current, clockAnchorRef.current)"), true, "autoplay retry reads the latest clockAnchorRef.current at retry time");
const applyYoutubeSource = sourceReceiver.slice(sourceReceiver.indexOf("const applyYouTubeSync"), sourceReceiver.indexOf("useEffect(() => {\n    if (failedVideoRef.current"));
const applyTikTokSource = sourceReceiver.slice(sourceReceiver.indexOf("const applyTikTokSync"), sourceReceiver.indexOf("const handleIframeLoad"));
const adminStartSource = sourceAdmin.slice(sourceAdmin.indexOf("const startTikTokPlayback"), sourceAdmin.indexOf("useEffect(() => {\n    clearDashboardTikTokReadyTimer"));
const adminTikTokMessageSource = sourceAdmin.slice(sourceAdmin.indexOf("function onMessage(event: MessageEvent)"), sourceAdmin.indexOf("window.addEventListener(\"message\", onMessage)"));
assert.equal(sourceAdmin.includes("const iframeLoadedRef = useRef(false)") && sourceAdmin.includes("const trustedEventSeenRef = useRef(false)") && sourceAdmin.includes("const [iframeLoaded, setIframeLoaded] = useState(false)"), true, "dashboard TikTok tracks iframe load separately from trusted player controls");
assert.equal(sourceAdmin.includes("const handleDashboardTikTokIframeLoad") && sourceAdmin.includes("iframeLoadedRef.current = true") && sourceAdmin.includes("setIframeLoaded(true)") && sourceAdmin.includes("onLoad={handleDashboardTikTokIframeLoad}"), true, "dashboard TikTok iframe onLoad sets loaded state");
assert.equal(sourceAdmin.includes("const markDashboardTikTokReady") && sourceAdmin.includes("trustedEventSeenRef.current = true") && sourceAdmin.includes("readyRef.current = true") && sourceAdmin.includes('statusRef.current = "ready"') && sourceAdmin.includes("clearDashboardTikTokReadyTimer()"), true, "any validated trusted dashboard TikTok event can mark controls ready");
assert.equal(adminTikTokMessageSource.indexOf('if (event.origin !== "https://www.tiktok.com") return') < adminTikTokMessageSource.indexOf('markDashboardTikTokReady("trusted_event")') && adminTikTokMessageSource.indexOf("if (event.source !== iframeRef.current?.contentWindow) return") < adminTikTokMessageSource.indexOf('markDashboardTikTokReady("trusted_event")') && adminTikTokMessageSource.indexOf('if (payload["x-tiktok-player"] !== true) return') < adminTikTokMessageSource.indexOf('markDashboardTikTokReady("trusted_event")'), true, "dashboard TikTok readiness is marked only after origin/source/payload validation");
assert.equal(sourceAdmin.includes('type === "onMute"') && sourceAdmin.includes('type === "onVolumeChange"'), true, "dashboard trusted readiness includes mute and volume events");
assert.equal(sourceAdmin.includes('const canStartTikTokPlayback = iframeLoaded && status === "ready" && firstStartStatus === "waiting" && !errorLabel') && sourceAdmin.includes("disabled={!canStartTikTokPlayback}") && !sourceAdmin.includes('disabled={status !== "ready" || !hasOfficialCurrentTime'), true, "TikTok start button requires loaded/ready state but no longer requires current-time evidence");
assert.equal(adminStartSource.includes("const hasObservedPosition = hasObservedCurrentTimeRef.current && Number.isFinite(latestTimeRef.current) && latestTimeRef.current >= 0") && adminStartSource.includes("let startPositionSeconds = hasObservedPosition ? latestTimeRef.current : 0") && adminStartSource.includes('setStartPositionSource(hasObservedPosition ? "official" : "zero-default")'), true, "first TikTok gesture start uses official position when present and zero-default otherwise");
assert.equal(adminStartSource.includes("Math.min(startPositionSeconds, durationRef.current)") && adminStartSource.includes("Math.max(0, startPositionSeconds)"), true, "TikTok gesture start position remains duration/minimum clamped");
assert.equal(!adminStartSource.includes("latestTimeObservedAtRef.current === null") && !adminStartSource.includes('projectObservedPlaybackTime("playing"') && !adminStartSource.includes("outboundTransitSeconds"), true, "gesture first-start position does not require observed-at timing, projection, or transit offsets");
assert.equal(sourceAdmin.includes("TIKTOK_LOADED_READY_FALLBACK_MS = 1_500") && sourceAdmin.includes('markDashboardTikTokReady("iframe_fallback")') && sourceAdmin.includes("loadedReadyFallbackTimerRef"), true, "loaded dashboard TikTok iframe can enable guarded fallback readiness after 1500ms");
assert.equal(sourceAdmin.includes("TikTok loaded but has not confirmed player controls yet.") && sourceAdmin.includes("trustedEventSeenRef.current || readyRef.current") && sourceAdmin.includes('statusRef.current = "error"'), true, "loaded iframe without trusted controls no longer produces the false fatal readiness error");
assert.equal(sourceAdmin.includes('Iframe: {iframeLoaded ? "loaded" : "loading"}') && sourceAdmin.includes("Controls: {controlsReadinessLabel}") && sourceAdmin.includes("Start position source: {startPositionSource}"), true, "dashboard exposes safe iframe/control/start-position diagnostics");
const youtubeLifecycleEffect = sourceReceiver.slice(sourceReceiver.indexOf("Provider lifecycle is keyed only by media identity."), sourceReceiver.indexOf("return <div className=\"live-overlay-youtube-player"));
const tiktokLifecycleEffect = sourceReceiver.slice(sourceReceiver.lastIndexOf("Provider lifecycle is keyed only by media identity."), sourceReceiver.indexOf("const safeStatus = playerError"));
assert.equal(adminStartSource.includes("let startPositionSeconds") && adminStartSource.includes("firstStartPositionRef.current = startPositionSeconds") && adminStartSource.includes('sendDashboardTikTokVoidCommand("play")'), true, "dashboard gesture start captures the exact start position and sends Play");
assert.equal(!adminStartSource.includes("projectObservedPlaybackTime(\"playing\"") && !adminStartSource.includes("outboundTransitSeconds"), true, "gesture first-start payload does not project or add transit to start position");
assert.equal(adminStartSource.indexOf('sendDashboardTikTokVoidCommand("play")') < adminStartSource.indexOf("startConfirmationTimerRef.current = window.setTimeout"), true, "dashboard Play occurs synchronously before the confirmation timeout is created");
assert.equal(!adminStartSource.includes("await") && !adminStartSource.includes("fetch(") && !adminStartSource.includes("publishOverlayTikTokSync") && !adminStartSource.includes("scheduledStartAt") && !sourceAdmin.includes("startToken"), true, "gesture-safe first start does not await fetch or create scheduled-start fields");
assert.equal(adminTikTokMessageSource.includes("firstStartCompletedRef.current = true") && adminTikTokMessageSource.includes('publish("playing", startPositionSeconds, "state_change"') && adminTikTokMessageSource.includes('publishOverlayTikTokSync(trackSyncInput, "playing", startPositionSeconds'), true, "first validated playing state publishes ordinary TikTok playing authority");
assert.equal(sourceAdmin.includes("TIKTOK_START_CONFIRMATION_TIMEOUT_MS = 1_500") && sourceAdmin.includes("manual_required") && sourceAdmin.includes("TikTok requires a direct Play click. Press Play in the player."), true, "blocked programmatic Play enters manual-required native-control fallback");
assert.equal(sourceAdmin.includes("START TIKTOK PLAYBACK") && sourceAdmin.includes("STARTING TIKTOK SIGNAL") && !sourceAdmin.includes("START SYNCHRONIZED PLAYBACK") && !sourceAdmin.includes("SYNCHRONIZING SIGNAL"), true, "dashboard uses gesture-safe TikTok start copy");
assert.equal(applyTikTokSource.includes("lastAppliedSyncRevisionRef") && applyTikTokSource.includes("duplicateRevision") && sourceReceiver.includes("beginStartupGrace()"), true, "TikTok receiver suppresses duplicate sync revisions while preserving startup grace");
assert.equal(sourceReceiver.includes("TIKTOK_PRESTART_POLL_DELAY_MS = 200") && sourceReceiver.includes("currentScene.tiktokPreload && !currentScene.tiktok ? TIKTOK_PRESTART_POLL_DELAY_MS : OVERLAY_POLL_DELAY_MS"), true, "receiver polls TikTok preload state at 200ms only before active playback");
assert.equal(sourceReceiver.includes("data-tiktok-authority") && sourceReceiver.includes("data-tiktok-sync-revision-applied"), true, "receiver exposes safe TikTok authority and sync revision diagnostics");
assert.equal(sourceReceiver.includes("type TikTokOverlayBootstrapStatus") && sourceReceiver.includes("commandedPlaybackStateRef") && sourceReceiver.includes("confirmedPlaybackStateRef") && sourceReceiver.includes("playbackConfirmedRef"), true, "overlay separates commanded state from confirmed playback state with an explicit bootstrap status");
assert.equal(sourceReceiver.includes("TIKTOK_ACTIVE_COMMAND_FALLBACK_MS = 750") && sourceReceiver.includes("performAlignment(\"fallback\")") && sourceReceiver.includes("!playbackConfirmedRef.current"), true, "active iframe fallback may issue one bootstrap command sequence without confirming playback");
assert.equal(sourceReceiver.includes("function estimatedTikTokLocalTime") && sourceReceiver.includes("performance.now()") && sourceReceiver.includes("localTimelineObservedAtRef") && sourceReceiver.includes("localTimelinePlaybackStateRef"), true, "receiver maintains a monotonic local TikTok timeline without provider telemetry");
assert.equal(!sourceReceiver.includes("scheduleTikTokStart") && !sourceReceiver.includes("scheduledStartAt") && !sourceReceiver.includes("startToken"), true, "scheduled-start receiver code was removed");
assert.equal(applyYoutubeSource.includes("[clockAnchorRef, markPlayerUnavailable]") && !applyYoutubeSource.includes("[clockAnchor,"), true, "applyYouTubeSync does not depend on a changing clockAnchor value");
assert.equal(youtubeLifecycleEffect.includes("Provider lifecycle is keyed only by media identity") && !youtubeLifecycleEffect.includes("clockAnchored") && !youtubeLifecycleEffect.includes("serverClockAnchored"), true, "YouTube construction effect does not rerun for server-clock updates");
assert.equal(tiktokLifecycleEffect.includes("Provider lifecycle is keyed only by media identity") && !tiktokLifecycleEffect.includes("clockAnchored") && !tiktokLifecycleEffect.includes("serverClockAnchored"), true, "TikTok lifecycle effect does not rerun for server-clock updates");
assert.equal(sourceReceiver.includes("data-overlay-server-clock={clockAnchored ? \"anchored\" : \"missing\"}") && sourceReceiver.includes("data-overlay-response-transit-ms={responseTransitMs ?? undefined}") && !sourceReceiver.includes("data-youtube-rtt-ms") && !sourceReceiver.includes("data-tiktok-rtt-ms"), true, "receiver exposes safe server-clock and response-transit diagnostics and omits unpopulated RTT attributes");
assert.equal(sourceReceiver.includes("failedPostRef.current = null") && sourceReceiver.includes("setPlayerError(null)"), true, "failedPostRef resets for new track/post identity");
assert.equal(sourceReceiver.includes('key={`${scene.tiktok.trackId ?? "trackless"}:${scene.tiktok.postId}`}') && !sourceReceiver.includes("tiktokPlayerIdentity"), true, "Component key uses track ID and post ID and preload alone does not mount the player");
assert.equal(sourceReceiver.includes("latestSyncRef.current = sync") && sourceReceiver.includes("useMemo(() =>") && sourceReceiver.includes("}, [sync.postId])"), true, "Heartbeats do not alter iframe src/key");
assert.equal(sourceReceiver.includes('autoplay: "1"') && sourceReceiver.includes('muted: "1"') && sourceReceiver.includes('play_button: "0"'), true, "active TikTok iframe requests muted autoplay and hides controls/play button");
assert.equal(sourceReceiver.includes('muted: "1"'), true, "Muted remains 1 for every overlay iframe");
assert.equal(sourceReceiver.includes("sendTikTokVoidCommand") && sourceReceiver.includes('postMessage({ type, "x-tiktok-player": true }, TIKTOK_ORIGIN)'), true, "Void commands omit value and use exact TikTok origin");
assert.equal(sourceReceiver.includes("sendTikTokSeekCommand") && sourceReceiver.includes('postMessage({ type: "seekTo", value: seconds, "x-tiktok-player": true }, TIKTOK_ORIGIN)'), true, "seekTo includes numeric value and exact TikTok origin");
assert.equal(!sourceReceiver.includes(", '*'") && !sourceReceiver.includes(', "*"'), true, "Wildcard target is absent");
assert.equal(!sourceReceiver.includes("unMute"), true, "unMute is absent");
assert.equal(sourceReceiver.includes("onLoad={handleIframeLoad}") && sourceReceiver.includes("iframeLoadedRef"), true, "iframe onLoad is tracked");
assert.equal(sourceReceiver.includes("TIKTOK IFRAME FAILED TO LOAD") && sourceReceiver.includes("iframe_load_timeout"), true, "iframe-load timeout has a distinct reason");
assert.equal(!sourceReceiver.includes("TIKTOK PLAYER DID NOT SIGNAL READY") && sourceReceiver.includes("player_event_timeout") && sourceReceiver.includes("telemetryStatus: \"missing\"") && sourceReceiver.includes("TIKTOK_ACTIVE_CONFIRMATION_TIMEOUT_MS = 4_000"), true, "missing TikTok telemetry remains nonfatal diagnostics and does not advance fake playback");
assert.equal(sourceReceiver.includes('if (type !== "onPlayerError") markTrustedPlayerEvent(type)') && sourceReceiver.includes('type !== "onMute"') && sourceReceiver.includes('type !== "onVolumeChange"'), true, "trusted events include state/time/mute/volume command readiness fallback");
assert.equal(sourceReceiver.includes("bootstrapAttemptRef.current += 1") && sourceReceiver.includes("bootstrapAttemptRef.current === 1"), true, "First 3002 retries once");
assert.equal(sourceReceiver.includes("TIKTOK AUTOPLAY BLOCKED BY OVERLAY BROWSER") && sourceReceiver.includes("autoplay_blocked"), true, "Second 3002 shows explicit autoplay fallback");
assert.equal(sourceReceiver.includes("INVALID VIDEO SIGNAL") && sourceReceiver.includes("TIKTOK SERVER ERROR") && sourceReceiver.includes("VIDEO PLAYBACK ERROR") && sourceReceiver.includes("TIKTOK PLAYER ERROR"), true, "Fatal TikTok labels remain distinct and safe");
assert.equal(sourceReceiver.includes("data-tiktok-status") && sourceReceiver.includes("data-tiktok-failure-reason") && sourceReceiver.includes("data-tiktok-error-code") && sourceReceiver.includes("data-tiktok-first-event") && sourceReceiver.includes("data-tiktok-last-event"), true, "Safe data diagnostic attributes exist");
assert.equal(!sourceReceiver.includes("JSON.stringify(payload)") && !sourceReceiver.includes("String(payload)"), true, "Raw provider payloads are not rendered");
assert.equal(sourceReceiver.includes('sendTikTokVoidCommand("mute")') && sourceReceiver.includes("sendTikTokSeekCommand") && sourceReceiver.includes('sendTikTokVoidCommand("play")'), true, "First playing bootstrap sends mute, seek, then play");
assert.equal(sourceReceiver.includes("TIKTOK_STARTUP_GRACE_MS = 2_500") && sourceReceiver.includes("TIKTOK_STARTUP_GRACE_SEVERE_DRIFT_SECONDS = 1.25"), true, "TikTok startup grace constants prevent normal startup catch-up loops");
assert.equal(sourceReceiver.includes("graceActive") && sourceReceiver.includes("TIKTOK_STARTUP_GRACE_SEVERE_DRIFT_SECONDS") && sourceReceiver.includes("!startupGraceCorrectionUsedRef.current") && sourceReceiver.includes("graceActive ? expected : playbackCorrectionTarget"), true, "startup grace suppresses proportional catch-up and allows only one severe exact correction");
assert.equal(sourceReceiver.includes("data-tiktok-bootstrap-status") && sourceReceiver.includes("data-tiktok-playback-confirmed") && sourceReceiver.includes("data-tiktok-commanded-state") && sourceReceiver.includes("data-tiktok-confirmed-state") && sourceReceiver.includes("data-tiktok-telemetry-status") && sourceReceiver.includes("data-tiktok-authority") && sourceReceiver.includes("data-tiktok-sync-revision-applied"), true, "safe TikTok bootstrap, confirmed playback, telemetry, authority, and revision diagnostics exist");
assert.equal(sourceReceiver.includes("generationRef.current !== generation") && sourceReceiver.includes("TIKTOK_DELAYED_PLAY_MS") && sourceReceiver.includes("bootstrapAttemptRef.current === 1"), true, "autoplay retry checks current generation and remains bounded");
assert.equal(sourceReceiver.includes("failedPostRef.current = null") && sourceReceiver.includes("sync.trackId"), true, "TikTok A-B-A and previously failed post lifecycles can recover");
assert.equal(sourceReceiver.includes("YouTubeOverlayPlayer") && sourceAdmin.includes("AdminYouTubePlayer"), true, "Existing YouTube player implementation remains present");
assert.equal(sourceCss.includes("live-overlay-youtube-scene--short"), true, "Existing YouTube Shorts CSS remains present");
assert.equal(sourceCss.includes("live-overlay-tiktok-rail") && sourceCss.includes("overflow-wrap: anywhere"), true, "TikTok vertical layout has a separate text rail");
assert.equal(!sourceCss.includes(".live-overlay-tiktok-player--preload") && sourceCss.includes(".live-overlay-tiktok-bootstrap-cover") && sourceCss.includes(".live-overlay-tiktok-iframe--bootstrapping") && sourceCss.includes("opacity: 0") && !sourceCss.includes("visibility: hidden"), true, "hidden TikTok playback preload CSS is removed and active bootstrap cover/opacity styles exist");
assert.equal(sourceAdmin.includes("Open Link") && sourceAdmin.includes("Copy Link") && sourceAdmin.includes("AdminTikTokPlayer"), true, "Existing PlayerDock TikTok behavior from PR #248 remains present");
assert.equal(sourceAdmin.includes("START TIKTOK PLAYBACK") && sourceAdmin.includes("STARTING TIKTOK SIGNAL"), true, "Admin TikTok first-start blocker and pending copy exist");
assert.equal(sourceAdmin.includes("firstStartCompletedRef") && sourceAdmin.includes("firstStartRequestedRef") && sourceAdmin.includes("startConfirmationTimerRef"), true, "Admin TikTok gesture-start refs exist");
assert.equal(sourceAdmin.includes('postMessage({ type, "x-tiktok-player": true }, "https://www.tiktok.com")') && !sourceAdmin.includes('"*"'), true, "Admin TikTok safe commands use exact TikTok origin and no wildcard target");
assert.equal(sourceAdmin.includes("lastStablePlaybackStateRef.current === \"playing\" || lastStablePlaybackStateRef.current === \"paused\"") && sourceAdmin.includes("firstStartCompletedRef.current &&"), true, "TikTok heartbeat waits for actual first playing state after gesture start");
assert.equal(!sourceAdmin.includes("queue-brain") && !sourceReceiver.includes("queue-brain"), true, "No queue-brain files were changed unnecessarily");
