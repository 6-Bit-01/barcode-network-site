import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");

test("permanent Studio links are private, stable, and use one authoritative state path", () => {
  const auth = source("src/lib/auth.ts");
  const client = source("src/lib/studio-overlay-client.ts");
  const access = source("src/app/api/admin/overlay/source-access/route.ts");
  const foregroundRoute = source("src/app/api/overlay/foreground/route.ts");
  const visualsRoute = source("src/app/api/overlay/radio-visuals/route.ts");
  const wheelRoute = source("src/app/api/overlay/wheel/route.ts");
  const foreground = source("src/components/ForegroundOverlayReceiver.tsx");
  const visuals = source("src/components/RadioVisualsReceiver.tsx");
  const live = source("src/components/LiveOverlayReceiver.tsx");
  const admin = source("src/components/AdminLiveOverlayControl.tsx");

  assert.match(auth, /createStudioOverlayToken/);
  assert.match(auth, /STUDIO_OVERLAY_TOKEN_SUBJECT = "studio_overlay"/);
  assert.match(auth, /JSON\.stringify\(\{ sub: STUDIO_OVERLAY_TOKEN_SUBJECT, v: 1 \}\)/);
  assert.doesNotMatch(auth.slice(auth.indexOf("createStudioOverlayToken"), auth.indexOf("verifyStudioOverlayToken")), /Date\.now|exp:|iat:/);
  assert.match(client, /window\.location\.hash/);
  assert.match(client, /Authorization: `Bearer \$\{accessToken\}`/);

  for (const route of [foregroundRoute, visualsRoute, wheelRoute]) {
    assert.match(route, /verifyStudioOverlayToken/);
    assert.match(route, /status: 401/);
  }
  assert.match(foreground, /studioOverlayRequestHeaders/);
  assert.match(visuals, /studioOverlayRequestHeaders/);
  assert.match(live, /wheelOnly \? studioOverlayRequestHeaders\(\) : undefined/);

  assert.match(access, /verifyAdminToken/);
  assert.match(access, /createStudioOverlayToken/);
  assert.match(access, /https:\/\/www\.barcode-network\.com/);
  assert.match(access, /STUDIO_SOURCE_QUERY = "\?studioSource=v1"/);
  assert.match(access, /foreground: `\$\{PRODUCTION_ORIGIN\}\/overlay\/foreground\$\{STUDIO_SOURCE_QUERY\}\$\{fragment\}`/);
  assert.match(access, /radioVisuals: `\$\{PRODUCTION_ORIGIN\}\/overlay\/radio-visuals\$\{STUDIO_SOURCE_QUERY\}\$\{fragment\}`/);
  assert.match(access, /wheel: `\$\{PRODUCTION_ORIGIN\}\/overlay\/wheel\$\{STUDIO_SOURCE_QUERY\}\$\{fragment\}`/);
  assert.match(foreground, /data-session-active=\{sessionActive \? "true" : "false"\}/);
  assert.doesNotMatch(foreground, /sessionActive \? <ForegroundOverlayStrip/);
  assert.match(admin, /One-Time TikTok Studio Source Setup/);
  assert.match(admin, /Load Permanent Private Links/);
  assert.doesNotMatch(admin, /Preview Wheel Source|Copy Wheel Link|Preview Visuals|Copy Visuals Link/);
});

test("all permanent Studio pages are native square sources", () => {
  const foregroundPage = source("src/app/overlay/foreground/page.tsx");
  const visualsPage = source("src/app/overlay/radio-visuals/page.tsx");
  const wheelPage = source("src/app/overlay/wheel/page.tsx");
  const foreground = source("src/components/ForegroundOverlayReceiver.tsx");
  const visuals = source("src/components/RadioVisualsReceiver.tsx");
  const visualsCss = source("src/app/overlay/radio-visuals/radio-visuals.css");
  const foregroundCss = source("src/app/overlay/foreground/calibration/foreground-calibration.css");
  const admin = source("src/components/AdminLiveOverlayControl.tsx");

  for (const page of [foregroundPage, visualsPage, wheelPage]) {
    assert.match(page, /width: 1080,[\s\S]*?height: 1080,/);
    assert.match(page, /minimumScale: 1,/);
    assert.match(page, /maximumScale: 1,/);
    assert.match(page, /userScalable: false,/);
  }
  assert.match(foreground, /data-source-resolution="1080x1080"/);
  assert.match(visuals, /data-source-aspect="1:1"/);
  assert.match(visuals, /data-source-resolution="1080x1080"/);
  assert.match(foregroundCss, /\.foreground-overlay-source-shell \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(visualsCss, /width: min\(100vw, 100vh\);[\s\S]*?height: min\(100vw, 100vh\);[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(admin, /Foreground Strip[\s\S]*?1080 × 1080[\s\S]*?Show Visuals[\s\S]*?1080 × 1080[\s\S]*?Live Overlay \+ Wheel \+ Audio[\s\S]*?1080 × 1080/);
  assert.doesNotMatch(admin, /1080 × 1920|1080 × 1440/);
});

test("square live and Wheel source follows session lifecycle, resolved ceremony authority, and browser-source audio", () => {
  const wheel = source("src/lib/wheel-overlay.ts");
  const receiver = source("src/components/LiveOverlayReceiver.tsx");
  const page = source("src/app/overlay/wheel/page.tsx");
  assert.match(wheel, /const broadcastActive = queueState\.session\?\.showStarted === true/);
  assert.match(wheel, /Promise\.all\(\[getStoredLiveOverlayState\(\), getLiveOverlayPlayerSync\(\)\]\)/);
  assert.match(wheel, /const wheelActive = Boolean\(scene\.wheelCeremony\)/);
  assert.match(wheel, /broadcastActive,[\s\S]*?scene,/);
  assert.doesNotMatch(wheel, /if \(!broadcastActive\)/);
  assert.doesNotMatch(wheel, /scene: wheelActive \? scene : null/);
  assert.doesNotMatch(wheel, /overlayState\.wheelOverlayActive === true &&/);
  assert.match(receiver, /const broadcastVisible = hasActiveQueueSession\(scene\)/);
  assert.doesNotMatch(receiver, /wheelSnapshot\?\.broadcastActive === true/);
  assert.match(receiver, /wheelSnapshot\?\.scene \?\? fallbackScene\(\)/);
  assert.match(receiver, /wheelOnly \? "wheel-overlay-stage " : ""/);
  assert.match(receiver, /data-broadcast-active="true"/);
  assert.match(receiver, /const cheer = new Audio\(WHEEL_WINNER_CHEER_AUDIO_PATH\)/);
  assert.match(receiver, /const encrypt = new Audio\(WHEEL_REENCRYPT_AUDIO_PATH\)/);
  assert.match(receiver, /playCheerSfx=\{wheelOnly \? \(\) => playWheelOnlySfx/);
  assert.match(page, /Live \+ Wheel Browser Source/);
  assert.match(receiver, /estimatedServerNowMs/);
  assert.match(receiver, /elapsedSinceSpinStartMs/);
  assert.match(receiver, /initialProgress/);
});
