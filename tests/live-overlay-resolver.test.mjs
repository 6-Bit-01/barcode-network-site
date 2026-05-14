import assert from "node:assert/strict";
import { resolveLiveOverlayScene } from "../src/lib/live-overlay-resolver.ts";

const session = { sessionId: "s1", status: "open", queueOpen: true, wheelSpinsOwed: 0, sponsorBreakStatus: "not_due", broadcastPhase: "broadcast_active" };
const track = { id: "t1", submittedArtistName: "Artist Name", submittedSongTitle: "Track Title", sourceType: "youtube", sourceArtworkUrl: "https://img.youtube.com/vi/abc/hqdefault.jpg", link: "https://youtube.com/watch?v=abc", durationLabel: "3:30" };

assert.equal(resolveLiveOverlayScene({}).mode, "standby", "no session resolves to standby");

assert.equal(resolveLiveOverlayScene({ currentSession: session }).mode, "session_active", "open session with no track resolves to intake/session scene");

const nowPlaying = resolveLiveOverlayScene({ currentSession: session, nowPlaying: track });
assert.equal(nowPlaying.mode, "now_playing", "loaded track resolves to now playing");
assert.equal(nowPlaying.track?.artistName, "Artist Name");
assert.equal(nowPlaying.track?.trackTitle, "Track Title");

assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, sponsorBreakStatus: "running" }, nowPlaying: track }).mode, "sponsor", "sponsor running beats now playing");

const wheelWaiting = resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 2 }, nowPlaying: track });
assert.equal(wheelWaiting.mode, "now_playing", "wheel owed does not auto-launch wheel scene");
assert.equal(wheelWaiting.wheelSpinsOwed, 2, "wheel owed count remains available for admin notification");

assert.equal(resolveLiveOverlayScene({ currentSession: { ...session, wheelSpinsOwed: 1 }, overlayState: { wheelOverlayActive: true }, nowPlaying: track }).mode, "wheel_ready", "launched wheel overlay resolves to wheel ready");

assert.equal(resolveLiveOverlayScene({ currentSession: session, overlayState: { wheelOverlayActive: false }, nowPlaying: track }).mode, "now_playing", "cleared wheel overlay returns to automatic now playing");

const system = resolveLiveOverlayScene({ currentSession: session, overlayState: { systemMessageActive: true, systemMessageTitle: "BRB", systemMessage: "Technical reset." }, nowPlaying: track });
assert.equal(system.mode, "system_message", "temporary system message overrides automatic scene");
assert.equal(system.title, "BRB");

const upload = resolveLiveOverlayScene({ currentSession: session, nowPlaying: { id: "u1", submittedArtistName: "Upload Artist", submittedSongTitle: "Upload Title", sourceType: "upload", sourceArtworkUrl: "https://foo.private.blob.vercel-storage.com/barcode-radio-queue/secret.png", link: "https://foo.private.blob.vercel-storage.com/barcode-radio-queue/private.mp3", durationLabel: "5:00" } });
assert.equal(upload.mode, "now_playing", "upload track can still display public-safe now playing metadata");
assert.equal(upload.sourceUrl, null, "upload source URL is not exposed");
assert.equal(upload.artworkUrl, null, "private blob artwork is not exposed");
assert.equal(upload.track?.trackTitle, "Upload Title", "private upload filename is not needed for display");

console.log("live overlay resolver tests passed");
