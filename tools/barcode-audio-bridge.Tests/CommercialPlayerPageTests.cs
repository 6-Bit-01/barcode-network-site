using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerPageTests
{
    [Fact]
    public void PlayerShowsOnlyTheLocalAnimatedBackgroundAtIdle()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("background: transparent", html);
        Assert.Contains("body::after", html);
        Assert.Contains("animation: commercial-source-capture-heartbeat 1s steps(2, end) infinite !important", html);
        Assert.Contains("@keyframes commercial-source-capture-heartbeat", html);
        Assert.Contains("const idleBackgroundUrl = '/v1/commercials/idle-background'", html);
        Assert.Contains("async function showIdleBackground()", html);
        Assert.Contains("tvStage.hidden = true", html);
        Assert.Contains("void showIdleBackground()", html);
        Assert.Contains("<video id=\"player\" preload=\"metadata\" autoplay", html);
        Assert.Contains("state.backgroundUrl", html);
        Assert.Contains("state.tvOverlayUrl", html);
        Assert.Contains("item.logoUrl", html);
        Assert.Contains("item.cornerLogoUrl", html);
        Assert.Contains("/v1/commercials/state", html);
        Assert.Contains("/v1/commercials/clip-started", html);
        Assert.Contains("/v1/commercials/complete", html);
        Assert.Contains("/v1/commercials/failed", html);
        Assert.False(html.Contains("https://", StringComparison.OrdinalIgnoreCase));
        Assert.False(html.Contains("localStorage", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PortraitStageCentersTheBackgroundWithoutStretchingIt()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("aspect-ratio: 9 / 16", html);
        Assert.Contains("width: min(100vw, 56.25vh)", html);
        Assert.Contains("height: min(100vh, 177.777778vw)", html);
        Assert.Contains("id=\"background-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("id=\"tv-overlay-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Matches(
            @"(?s)#background-video\s*\{.*?object-fit:\s*cover;.*?transform:\s*scale\(1\.18\);.*?transform-origin:\s*left top;",
            html);
        Assert.Matches(@"(?s)#tv-overlay-video\s*\{.*?object-fit:\s*cover;", html);
        Assert.Contains("clearVisualVideo(backgroundVideo)", html);
        Assert.Contains("clearVisualVideo(tvOverlayVideo)", html);
        Assert.Contains("stage.hidden = true", html);
        Assert.Contains("stage.hidden = false", html);
    }

    [Fact]
    public void CroppedReferenceGeometryUsesOneCompleteMaskedBezelAboveAnAutomaticallyFittedCommercial()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Matches(
            @"(?s)#tv-stage\s*\{.*?top:\s*30\.6%;.*?width:\s*92%;.*?aspect-ratio:\s*719\s*/\s*435;.*?overflow:\s*hidden;.*?z-index:\s*2;",
            html);
        Assert.Matches(
            @"(?s)#tv-source\s*\{.*?left:\s*-2\.6738%;.*?top:\s*-2\.7624%;.*?width:\s*106\.9519%;.*?height:\s*110\.4972%;",
            html);
        Assert.Matches(
            @"(?s)#video-window\s*\{.*?left:\s*5%;.*?top:\s*8\.5%;.*?width:\s*90%;.*?height:\s*77%;.*?z-index:\s*1;",
            html);
        Assert.Matches(
            @"(?s)#tv-overlay-video\s*\{.*?width:\s*100%;.*?height:\s*100%;.*?object-fit:\s*cover;.*?z-index:\s*2;",
            html);
        Assert.Contains("id=\"tv-bezel-mask\"", html);
        Assert.Contains("-webkit-mask: url(#tv-bezel-mask)", html);
        Assert.Contains("fill-rule=\"evenodd\"", html);
        Assert.Contains("M.083007 .097510H.914399", html);
        Assert.DoesNotContain("clip-path:", html);
        Assert.DoesNotContain("linear-gradient(#fff 0 0)", html);
        Assert.DoesNotContain("#tv-stage::before", html);
        Assert.DoesNotContain("#tv-stage::after", html);
        Assert.Matches(
            @"(?s)<div id=""tv-stage"" hidden>.*?<div id=""tv-source"">.*?<div id=""video-window"">.*?<video id=""player"".*?<img id=""corner-logo-a"".*?<img id=""corner-logo-b"".*?</div>.*?<video id=""tv-overlay-video""",
            html);
        Assert.DoesNotContain("border-radius: 2.4% / 4.5%", html);
        Assert.Matches(@"(?s)#player\s*\{.*?left:\s*50%;.*?top:\s*50%;.*?width:\s*var\(--player-fit-width, 100\.8%\);.*?height:\s*var\(--player-fit-height, 100\.8%\);.*?object-fit:\s*fill;.*?object-position:\s*center center;.*?transform:\s*translate\(-50%, -50%\);", html);
        Assert.Matches(@"(?s)\.corner-logo\s*\{.*?right:\s*2\.2%;.*?bottom:\s*2\.2%;.*?width:\s*18%;.*?height:\s*16%;.*?z-index:\s*2;", html);
    }

    [Fact]
    public void TvFrameRunsAtHalfSpeedWhileLightPulsesStayFrequentAndDecoderCheap()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("startVisualVideo(tvOverlayVideo, state.tvOverlayUrl, 'TV overlay', token, .5)", html);
        Assert.Contains("element.defaultPlaybackRate = playbackRate", html);
        Assert.Contains("element.playbackRate = playbackRate", html);
        Assert.Contains("id=\"tv-light-pulses\"", html);
        Assert.Contains("animation: tv-light-yellow-pulse 1.7s", html);
        Assert.Contains("animation: tv-light-red-pulse 1.35s", html);
        Assert.DoesNotContain("<video id=\"tv-light", html);
    }

    [Fact]
    public void TvFramePowersOnOverBlackBeforeTheFirstCommercialStarts()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("id=\"tv-stage\" hidden", html);
        Assert.Contains("id=\"crt-power-on\"", html);
        Assert.Contains("@keyframes crt-power-on", html);
        Assert.Contains("animation: crt-power-on 880ms", html);
        Assert.Contains("async function runCrtPowerOn(token)", html);
        Assert.Contains("showStatus(`BREAK ${state.generation} · CRT POWER ON`)", html);
        Assert.Matches(
            @"(?s)tvStage\.hidden = false;.*?await runCrtPowerOn\(token\);.*?post\(`/v1/commercials/clip-started",
            html);
        Assert.DoesNotContain("<video id=\"crt-power-on", html);
    }

    [Fact]
    public void CornerLogosPreloadAndHandoffWithoutEverDisplayingTwoAtOnce()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("var(--corner-logo-fade-duration, 2400ms)", html);
        Assert.Contains("id=\"corner-logo-a\" class=\"corner-logo\"", html);
        Assert.Contains("id=\"corner-logo-b\" class=\"corner-logo\"", html);
        Assert.Contains("return Math.min(2600, Math.max(800, totalMs * .14))", html);
        Assert.Contains("activeCornerLogo?.dataset.identity === identity", html);
        Assert.Contains("primedCornerLogo = activeCornerLogo", html);
        Assert.Contains("const leadMs = cornerLogoFadeMs(nextItem) + 350", html);
        Assert.Contains("primeCornerLogo(nextItem, token, false)", html);
        Assert.Contains("if (item?.cornerLogoUrl) return", html);
        Assert.Contains("primeCornerLogo(nextItem, token, true)", html);
        Assert.Contains("activateCornerLogoForItem(item, token)", html);
        Assert.Contains("showCornerLogoInstant(element, item)", html);
        Assert.Contains("if (candidate !== element) clearCornerLogoElement(candidate)", html);
        Assert.Contains("if (previous && previous !== element) clearCornerLogoElement(previous)", html);
        Assert.Contains("element.dataset.variant = String(item.cornerLogoVariant || 1)", html);
        Assert.Matches(
            @"(?s)\.corner-logo\[data-variant=""2""\]\s*\{.*?width:\s*15\.3%;.*?height:\s*13\.6%;",
            html);
    }

    [Fact]
    public void EveryCommercialUsesCenteredMetadataDrivenFitWithBoundedDistortionAndSafetyBleed()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("const automaticFitMaximumDistortion = 1.085", html);
        Assert.Contains("const automaticFitSafetyBleed = 1.008", html);
        Assert.Contains("function calculateAutomaticPlayerFit(sourceWidth, sourceHeight, apertureWidth, apertureHeight)", html);
        Assert.Contains("const minimumRenderedAspect = sourceAspect / automaticFitMaximumDistortion", html);
        Assert.Contains("const maximumRenderedAspect = sourceAspect * automaticFitMaximumDistortion", html);
        Assert.Contains("Math.min(maximumRenderedAspect, Math.max(minimumRenderedAspect, apertureAspect))", html);
        Assert.Contains("player.dataset.fit = 'automatic'", html);
        Assert.Contains("--player-fit-width", html);
        Assert.Contains("--player-fit-height", html);
        Assert.DoesNotContain("softFitNames", html);
        Assert.DoesNotContain("eversnow", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("crackedencounters", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void DynamicLogoApertureUsesReferencePositionAndDurationAwareFades()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Matches(
            @"(?s)#logo\s*\{.*?top:\s*5\.4%;.*?width:\s*96%;.*?height:\s*26\.5%;.*?z-index:\s*3;",
            html);
        Assert.Contains("var(--logo-fade-duration, 1800ms)", html);
        Assert.Contains("#logo.visible", html);
        Assert.Contains("const totalMs = Math.max(1000, item.durationSeconds * 1000)", html);
        Assert.Contains("totalMs - fadeMs - 200", html);
        Assert.Contains("logo.style.setProperty('--logo-fade-duration'", html);
        Assert.Contains("#logo[data-brand=\"bcn\"], #logo[data-brand=\"bl\"]", html);
        Assert.Contains("width: 120%", html);
        Assert.Contains("height: 33.125%", html);
        Assert.Contains("logo.dataset.brand = item.logoBrand", html);
    }

    [Fact]
    public void ClipsLoadOnDemandAndPreviewCannotExposeNativeControls()
    {
        var html = CommercialPlayerPage.Html;

        Assert.DoesNotContain("preloadPlayer", html);
        Assert.DoesNotContain("preload(nextItem)", html);
        Assert.Contains("<video id=\"player\" preload=\"metadata\"", html);
        Assert.Contains("query.get('debug') === '1'", html);
        Assert.DoesNotContain("body.debug #tv-stage", html);
        Assert.DoesNotContain("body.debug #video-window", html);
        Assert.DoesNotContain("player.controls", html);
    }

    [Fact]
    public void AudibleAutoplayBlockWaitsForOneClickAndRetriesTheSameClip()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("id=\"audio-gate\" type=\"button\" hidden", html);
        Assert.Contains("CLICK ONCE TO ENABLE COMMERCIAL AUDIO", html);
        Assert.Contains("The diagnostic preview will resume the same clip.", html);
        Assert.Contains("name === 'NotAllowedError'", html);
        Assert.Contains("function waitForAudioGesture(item, token)", html);
        Assert.Contains("playback = player.play()", html);
        Assert.Contains("await waitForAudioGesture(item, token)", html);
        Assert.Contains("while (isAutoplayBlock(playbackError) && token === runToken)", html);
        Assert.Contains("if (debug && !navigator.userActivation?.hasBeenActive) audioGate.hidden = false", html);
        Assert.Matches(
            @"(?s)async function playWithAudioRecovery.*?await player\.play\(\);.*?isAutoplayBlock\(playbackError\).*?waitForAudioGesture\(item, token\)",
            html);
    }
}
