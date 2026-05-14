import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveLiveOverlayScene } from "../src/lib/live-overlay-resolver.ts";

const session = { sessionId: "s1", status: "open", queueOpen: true, wheelSpinsOwed: 0, sponsorBreakStatus: "not_due", broadcastPhase: "broadcast_active" };
const youtubeTrack = { id: "yt1", submittedArtistName: "Artist Name", submittedSongTitle: "Video Track", sourceType: "youtube", sourceArtworkUrl: "https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg", link: "https://youtube.com/watch?v=abcdefghijk", durationLabel: "3:30", youtubeVideoId: "abcdefghijk" };
const spotifyTrack = { id: "sp1", submittedArtistName: "Spotify Artist", submittedSongTitle: "Audio Track", sourceType: "spotify", sourceArtworkUrl: "https://i.scdn.co/image/example", link: "https://open.spotify.com/track/abc123", durationLabel: "2:45" };

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
assert.equal(adminPanel.includes("Show Now Playing"), false, "admin panel does not expose normal manual scene picker");
assert.equal(adminPanel.includes("Temporary System Message") && adminPanel.indexOf("Temporary System Message") > adminPanel.indexOf("<details"), true, "temporary system message is inside collapsed emergency details");

const receiver = readFileSync("src/components/LiveOverlayReceiver.tsx", "utf8");
const overlayCss = readFileSync("src/app/overlay/live/overlay-live.css", "utf8");
assert.equal(receiver.includes("Click to spin"), false, "public wheel overlay does not include stock click-to-spin text");
assert.equal(receiver.includes("ctrl+enter"), false, "public wheel overlay does not include stock keyboard shortcut text");
assert.equal(receiver.includes("live-overlay-wheel-roster"), false, "public wheel overlay does not render the previous bottom roster/control clutter");
assert.equal(receiver.includes(`!wheelVisible && <div className="live-overlay-footer"`), true, "public wheel ceremony hides the generic overlay footer");
assert.equal(receiver.includes("live-overlay-wheel-slice-label"), true, "public wheel overlay renders candidate names as slice labels");
assert.equal(receiver.includes("#7c3aed") && receiver.includes("#facc15") && receiver.includes("#22c55e"), true, "wheel slice palette includes expanded BARCODE colors");
assert.equal(receiver.includes("wheelLabelMetrics") && receiver.includes("--wheel-label-width") && receiver.includes("--wheel-label-distance"), true, "wheel artist labels use dynamic sizing variables");
assert.equal(receiver.includes("Re-encrypting Signal") || receiver.includes("RE-ENCRYPTING"), true, "receiver has re-encryption ceremony copy");
assert.equal(overlayCss.includes("width: min(91.5vmin, 100%)"), true, "wheel is sized to dominate the square overlay");
assert.equal(overlayCss.includes("live-wheel-reencrypt-sweep") && overlayCss.includes("live-wheel-pointer-pulse"), true, "wheel ceremony CSS includes re-encryption and pointer polish effects");

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

const spinning = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:03.000Z") });
assert.equal(spinning.mode, "wheel_spinning", "spin scene stays spinning during the visual spin window");
assert.equal(spinning.wheelCeremony?.resultTrack?.id, "free-2", "server-selected result is stored while visual spin runs");

const pendingResult = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "spinning", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-2", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:08.000Z") });
assert.equal(pendingResult.mode, "wheel_result", "spinning ceremony becomes result pending after spin duration");
assert.equal(pendingResult.wheelCeremony?.status, "result_pending", "computed ceremony status waits for host confirmation");

const reencrypting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(reencrypting.mode, "wheel_reencrypting", "re-encrypting ceremony shows re-encryption scene first");
assert.equal(reencrypting.subtitle, "RE-ENCRYPTING SIGNAL", "re-encrypting scene uses BARCODE-controlled copy");

const reencryptedPending = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "reencrypting", wheelOverlayActive: true, wheelCeremonySpinStartedAt: "2026-05-14T00:00:00.000Z", wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:08.000Z") });
assert.equal(reencryptedPending.mode, "wheel_result", "re-encrypting ceremony returns to result pending after the visual sequence");

const confirmedFresh = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 0 }, overlayState: { wheelCeremonyStatus: "confirmed", wheelOverlayActive: true, wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, now: new Date("2026-05-14T00:00:01.000Z") });
assert.equal(confirmedFresh.mode, "wheel_confirmed", "fresh confirmed result shows lock-in scene");

const confirmedExpired = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 0 }, overlayState: { wheelCeremonyStatus: "confirmed", wheelOverlayActive: true, wheelCeremonyResultTrackId: "free-1", wheelCeremonyResultSelectedAt: "2026-05-14T00:00:00.000Z" }, wheelCandidates: eligibleCandidates, nowPlaying: spotifyTrack, now: new Date("2026-05-14T00:00:04.000Z") });
assert.equal(confirmedExpired.mode, "now_playing", "confirmed scene automatically returns to normal resolver after lock-in window");

const cancelled = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelCeremonyStatus: "cancelled", wheelOverlayActive: false }, wheelCandidates: eligibleCandidates, nowPlaying: spotifyTrack });
assert.equal(cancelled.mode, "now_playing", "cancelled wheel returns to automatic overlay mode without a wheel scene");

console.log("live overlay resolver tests passed");
