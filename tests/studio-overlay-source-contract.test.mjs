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

test("permanent Studio sources advertise and render their native geometry on the first frame", () => {
  const foregroundPage = source("src/app/overlay/foreground/page.tsx");
  const visualsPage = source("src/app/overlay/radio-visuals/page.tsx");
  const wheelPage = source("src/app/overlay/wheel/page.tsx");
  const foreground = source("src/components/ForegroundOverlayReceiver.tsx");
  const visuals = source("src/components/RadioVisualsReceiver.tsx");
  const wheel = source("src/components/LiveOverlayReceiver.tsx");
  const visualsCss = source("src/app/overlay/radio-visuals/radio-visuals.css");
  const wheelCss = source("src/app/overlay/wheel/wheel-overlay.css");

  assert.match(foregroundPage, /width: 1080,[\s\S]*?height: 1920,/);
  assert.match(visualsPage, /width: 1080,[\s\S]*?height: 1440,/);
  assert.match(wheelPage, /width: 1080,[\s\S]*?height: 1080,/);
  for (const page of [foregroundPage, visualsPage, wheelPage]) {
    assert.match(page, /minimumScale: 1,/);
    assert.match(page, /maximumScale: 1,/);
    assert.match(page, /userScalable: false,/);
  }

  assert.match(foreground, /width: "1080px",[\s\S]*?height: "1920px",/);
  assert.match(visuals, /RADIO_VISUALS_SOURCE_STYLE = \{ width: "1080px", height: "1440px" \}/);
  assert.match(visuals, /<canvas ref=\{canvasRef\} className="radio-visuals-canvas" width=\{1080\} height=\{1440\} \/>/);
  assert.match(wheel, /WHEEL_SOURCE_STYLE = \{ width: "1080px", height: "1080px" \}/);
  assert.match(wheel, /data-source-resolution=\{wheelOnly \? "1080x1080" : undefined\}/);

  assert.match(visualsCss, /width: 1080px;[\s\S]*?height: 1440px;/);
  assert.doesNotMatch(visualsCss, /100vw|100vh|75vh|133\.333333vw/);
  assert.match(wheelCss, /width: 1080px;[\s\S]*?height: 1080px;/);
  assert.doesNotMatch(wheelCss, /100vw|100vh|min\(100vw/);
});

test("square live and Wheel source follows broadcast lifecycle, resolved ceremony authority, and browser-source audio", () => {
  const wheel = source("src/lib/wheel-overlay.ts");
  const receiver = source("src/components/LiveOverlayReceiver.tsx");
  const page = source("src/app/overlay/wheel/page.tsx");
  assert.match(wheel, /const broadcastActive = queueState\.session\?\.showStarted === true/);
  assert.match(wheel, /Promise\.all\(\[getStoredLiveOverlayState\(\), getLiveOverlayPlayerSync\(\)\]\)/);
  assert.match(wheel, /const wheelActive = Boolean\(scene\.wheelCeremony\)/);
  assert.match(wheel, /broadcastActive: true,[\s\S]*?scene,/);
  assert.doesNotMatch(wheel, /scene: wheelActive \? scene : null/);
  assert.doesNotMatch(wheel, /overlayState\.wheelOverlayActive === true &&/);
  assert.match(receiver, /const broadcastVisible = hasActiveQueueSession\(scene\)/);
  assert.match(receiver, /wheelSnapshot\?\.broadcastActive === true/);
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
