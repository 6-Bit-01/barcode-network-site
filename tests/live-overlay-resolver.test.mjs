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

console.log("live overlay resolver tests passed");
