using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerPageTests
{
    [Fact]
    public void PlayerIsTransparentAtIdleAndUsesOnlyLocalCommercialEndpoints()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("background: transparent", html);
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
    public void CroppedReferenceGeometryUsesOneCompleteMaskedBezelAboveAnOverscannedCommercial()
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
            @"(?s)<div id=""tv-stage"">.*?<div id=""tv-source"">.*?<div id=""video-window"">.*?<video id=""player"".*?<img id=""corner-logo"".*?</div>.*?<video id=""tv-overlay-video""",
            html);
        Assert.DoesNotContain("border-radius: 2.4% / 4.5%", html);
        Assert.Matches(@"(?s)#player\s*\{.*?width:\s*100%;.*?height:\s*100%;.*?object-fit:\s*cover;.*?transform:\s*scale\(1\.10\);", html);
        Assert.Matches(@"(?s)#player\[data-fit=""soft""\]\s*\{.*?object-fit:\s*fill;.*?transform:\s*scale\(1\.015\);", html);
        Assert.Matches(@"(?s)#corner-logo\s*\{.*?right:\s*2\.2%;.*?bottom:\s*2\.2%;.*?width:\s*18%;.*?height:\s*16%;.*?z-index:\s*2;", html);
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
    public void CornerLogosUseSlowFadesAndVariantTwoIsExactlyFifteenPercentSmaller()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("var(--corner-logo-fade-duration, 2400ms)", html);
        Assert.Contains("const fadeMs = Math.min(2600, Math.max(800, totalMs * .14))", html);
        Assert.Contains("cornerLogo.classList.add('visible')", html);
        Assert.Contains("cornerLogo.classList.remove('visible')", html);
        Assert.Contains("cornerLogo.dataset.variant = String(item.cornerLogoVariant || 1)", html);
        Assert.Matches(
            @"(?s)#corner-logo\[data-variant=""2""\]\s*\{.*?width:\s*15\.3%;.*?height:\s*13\.6%;",
            html);
    }

    [Fact]
    public void NearSixteenByNineCommercialsPreserveTheirTopAndBottomWithBoundedSoftFit()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("new Set(['eversnow', 'alien', 'crackedencounters'])", html);
        Assert.Contains("const softFitMaximumStretch = 1.085", html);
        Assert.Contains("const sourceAspect = player.videoWidth / player.videoHeight", html);
        Assert.Contains("const stretch = apertureAspect / sourceAspect", html);
        Assert.Contains("stretch >= 1 && stretch <= softFitMaximumStretch", html);
        Assert.Contains("player.dataset.fit = 'soft'", html);
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
