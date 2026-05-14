import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWheelSegments, resolveLiveOverlayScene, WHEEL_RIGHT_POINTER_ANGLE_DEGREES, wheelFinalRotationForSegment, wheelFinalRotationForSlice, wheelSegmentAtPointer, wheelSliceIndexAtPointer } from "../src/lib/live-overlay-resolver.ts";

const session = { sessionId: "s1", status: "open", queueOpen: true, wheelSpinsOwed: 0, sponsorBreakStatus: "not_due", broadcastPhase: "broadcast_active" };
const youtubeTrack = { id: "yt1", submittedArtistName: "Artist Name", submittedSongTitle: "Video Track", sourceType: "youtube", sourceArtworkUrl: "https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg", link: "https://youtube.com/watch?v=abcdefghijk", durationLabel: "3:30", youtubeVideoId: "abcdefghijk" };
const spotifyTrack = { id: "sp1", submittedArtistName: "Spotify Artist", submittedSongTitle: "Audio Track", sourceType: "spotify", sourceArtworkUrl: "https://i.scdn.co/image/example", link: "https://open.spotify.com/track/abc123", durationLabel: "2:45" };


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

assert.equal(resolveLiveOverlayScene({}).mode, "standby", "no session resolves to standby");
assert.equal(resolveLiveOverlayScene({ currentSession: session }).mode, "session_active", "open session with no track resolves to intake/session scene");

const youtubeNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: youtubeTrack });
assert.equal(youtubeNowPlaying.mode, "now_playing", "YouTube track resolves to now playing");
assert.equal(youtubeNowPlaying.youtube?.videoId, "abcdefghijk", "YouTube scene includes safe player metadata");
assert.equal(youtubeNowPlaying.youtube?.muted, true, "YouTube overlay defaults muted");

const nonYoutubeNowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: spotifyTrack });
assert.equal(nonYoutubeNowPlaying.mode, "now_playing", "non-YouTube track resolves to artist card now playing");
assert.equal(nonYoutubeNowPlaying.youtube, undefined, "non-YouTube now playing has no YouTube player metadata");

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
const liveOverlayController = readFileSync("src/lib/live-overlay.ts", "utf8");
assert.equal(adminPanel.includes("Show Now Playing"), false, "admin panel does not expose normal manual scene picker");
assert.equal(adminPanel.includes("Temporary System Message") && adminPanel.indexOf("Temporary System Message") > adminPanel.indexOf("<details"), true, "temporary system message is inside collapsed emergency details");
assert.equal(adminPanel.includes("selectedWheelTrackId") && adminPanel.includes("Choose winning track") && adminPanel.includes("selectedTrackId"), true, "admin panel provides a grouped winner track picker before confirming Wheel Chosen");
assert.equal(liveOverlayController.includes("submitterIdentityKeys") && liveOverlayController.includes("trackCount") && liveOverlayController.includes("findTrackInWinnerGroup"), true, "wheel controller groups candidates by submitter identity and resolves grouped winners to a selected track");

const receiver = readFileSync("src/components/LiveOverlayReceiver.tsx", "utf8");
const overlayCss = readFileSync("src/app/overlay/live/overlay-live.css", "utf8");
assert.equal(receiver.includes("Click to spin"), false, "public wheel overlay does not include stock click-to-spin text");
assert.equal(receiver.includes("ctrl+enter"), false, "public wheel overlay does not include stock keyboard shortcut text");
assert.equal(receiver.includes("live-overlay-wheel-roster"), false, "public wheel overlay does not render the previous bottom roster/control clutter");
assert.equal(receiver.includes(`!wheelVisible && <div className="live-overlay-footer"`), true, "public wheel ceremony hides the generic overlay footer");
assert.equal(receiver.includes("live-overlay-wheel-slice-label"), true, "public wheel overlay renders candidate names as slice labels");
assert.equal(receiver.includes("#7c3aed") && receiver.includes("#facc15") && receiver.includes("#22c55e"), true, "wheel slice palette includes expanded BARCODE colors");
assert.equal(receiver.includes("wheelLabelMetrics") && receiver.includes("wheelLabelFit") && receiver.includes("--wheel-name-size") && receiver.includes("--wheel-label-width") && receiver.includes("--wheel-label-x") && receiver.includes("--wheel-label-rotation"), true, "wheel artist labels use per-name dynamic sizing and slice-body placement variables");
assert.equal(receiver.includes("Winner selection is based on slice geometry") && receiver.includes("wheelFinalRotationForSegment") && receiver.includes("live-overlay-wheel-winning-segment"), true, "wheel receiver documents labels as visual-only, lands stored winners with segment geometry, and renders a segment highlight");
assert.equal(receiver.includes("Re-encrypting Signal") || receiver.includes("RE-ENCRYPTING"), true, "receiver has re-encryption ceremony copy");
assert.equal(receiver.includes("data-wheel-animation-key") && receiver.includes("reencryptCycleId") && receiver.includes("key={animationKey}"), true, "receiver keys re-encryption cycles so CSS animation remounts and replays every time");
assert.equal(liveOverlayController.includes("wheelCeremonyPreviousSeed") && liveOverlayController.includes("wheelCeremonyReencryptCycleId") && liveOverlayController.includes("payload.action === \"reencryptWheel\""), true, "wheel controller persists previous seed plus a fresh re-encryption cycle id on each re-encrypt click");
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

const timingCandidates = [
  { id: "alpha", submittedArtistName: "Alpha", submittedSongTitle: "One" },
  { id: "bravo", submittedArtistName: "Bravo", submittedSongTitle: "Two" },
  { id: "charlie", submittedArtistName: "Charlie", submittedSongTitle: "Three" },
];
const previousSeedReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonySeed: "prev" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.000Z") });
const currentSeedReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "ready", wheelOverlayActive: true, wheelCeremonySeed: "new" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.000Z") });
assert.notDeepEqual(previousSeedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), currentSeedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "test seeds produce visibly different wheel mappings");

const reencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonySeed: "new", wheelCeremonyPreviousSeed: "prev", wheelCeremonyReencryptCycleId: "cycle-1" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:00.300Z") });
assert.equal(reencrypting.mode, "wheel_reencrypting", "re-encrypting ceremony shows re-encryption scene first");
assert.equal(reencrypting.subtitle, "RE-ENCRYPTING SIGNAL", "re-encrypting scene uses BARCODE-controlled copy");
assert.equal(reencrypting.wheelCeremony?.reencryptCycleId, "cycle-1", "first re-encrypt exposes animation cycle id to the overlay");
assert.deepEqual(reencrypting.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), previousSeedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "early re-encrypt keeps the previous clean mapping visible before the obscured remap point");

const secondReencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:10.000Z", wheelCeremonySeed: "prev", wheelCeremonyPreviousSeed: "new", wheelCeremonyReencryptCycleId: "cycle-2" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:10.300Z") });
assert.equal(secondReencrypting.wheelCeremony?.reencryptCycleId, "cycle-2", "second re-encrypt exposes a different cycle id so animation can replay");
assert.notEqual(secondReencrypting.wheelCeremony?.reencryptCycleId, reencrypting.wheelCeremony?.reencryptCycleId, "successive re-encrypt cycles are distinguishable by the receiver");

const remappedDuringGlitch = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonySeed: "new", wheelCeremonyPreviousSeed: "prev", wheelCeremonyReencryptCycleId: "cycle-1" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(remappedDuringGlitch.mode, "wheel_reencrypting", "re-encrypt remains visually glitching after the remap point");
assert.deepEqual(remappedDuringGlitch.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), currentSeedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "re-encrypt switches to the new mapping while the glitch state is still active");

const reencryptedReady = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonySeed: "new", wheelCeremonyPreviousSeed: "prev", wheelCeremonyReencryptCycleId: "cycle-1" }, wheelCandidates: timingCandidates, now: new Date("2026-05-14T00:00:02.000Z") });
assert.equal(reencryptedReady.mode, "wheel_ready", "re-encrypting ceremony returns to ready without selecting a winner");
assert.equal(reencryptedReady.wheelCeremony?.resultTrackId, undefined, "re-encrypting does not produce a final winner");
assert.deepEqual(reencryptedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), currentSeedReady.wheelCeremony?.displayCandidates.map((candidate) => candidate.id), "ready state resolves with the remapped names after the glitch clears");

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
