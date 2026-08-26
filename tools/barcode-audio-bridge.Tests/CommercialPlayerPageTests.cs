using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerPageTests
{
    [Fact]
    public void PlayerIsTransparentAtIdleAndUsesOnlyLocalCommercialEndpoints()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("background: transparent", html);
        Assert.Contains("<video id=\"player\" preload=\"auto\" autoplay", html);
        Assert.Contains("state.backgroundUrl", html);
        Assert.Contains("state.tvOverlayUrl", html);
        Assert.Contains("item.logoUrl", html);
        Assert.Contains("/v1/commercials/state", html);
        Assert.Contains("/v1/commercials/clip-started", html);
        Assert.Contains("/v1/commercials/complete", html);
        Assert.Contains("/v1/commercials/failed", html);
        Assert.False(html.Contains("https://", StringComparison.OrdinalIgnoreCase));
        Assert.False(html.Contains("localStorage", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PortraitStageCentersMatchingMutedBackgroundAndTvVideosOnlyDuringBreak()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("aspect-ratio: 9 / 16", html);
        Assert.Contains("width: min(100vw, 56.25vh)", html);
        Assert.Contains("height: min(100vh, 177.777778vw)", html);
        Assert.Contains("id=\"background-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("id=\"tv-overlay-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("clearVisualVideo(backgroundVideo)", html);
        Assert.Contains("clearVisualVideo(tvOverlayVideo)", html);
        Assert.Contains("stage.hidden = true", html);
        Assert.Contains("stage.hidden = false", html);
    }

    [Fact]
    public void CommercialWindowReplacesTheTvScreenAtTheReferenceCoordinates()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Matches(@"(?s)#tv-overlay-video\s*\{.*?inset:\s*0;.*?z-index:\s*1;", html);
        Assert.Matches(
            @"(?s)#video-window\s*\{.*?left:\s*3\.9%;.*?top:\s*35\.85%;.*?width:\s*92\.5%;.*?height:\s*28\.8%;.*?z-index:\s*2;",
            html);
        Assert.Contains("overflow: hidden", html);
        Assert.Contains("border-radius: 1.8% / 3.2%", html);
        Assert.Matches(@"(?s)#player\s*\{.*?width:\s*100%;.*?height:\s*100%;.*?object-fit:\s*cover;", html);
        Assert.DoesNotContain("-webkit-mask:", html);
    }

    [Fact]
    public void DynamicLogoApertureUsesReferencePositionAndDurationAwareFades()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Matches(
            @"(?s)#logo\s*\{.*?top:\s*11\.25%;.*?width:\s*72%;.*?height:\s*14\.75%;.*?z-index:\s*3;",
            html);
        Assert.Contains("var(--logo-fade-duration, 1800ms)", html);
        Assert.Contains("#logo.visible", html);
        Assert.Contains("const totalMs = Math.max(1000, item.durationSeconds * 1000)", html);
        Assert.Contains("totalMs - fadeMs - 200", html);
        Assert.Contains("logo.style.setProperty('--logo-fade-duration'", html);
    }

    [Fact]
    public void OnlyOneNextClipIsPreloadedAndDebugModeOutlinesTheTvWindow()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("let preloadPlayer = null", html);
        Assert.Contains("preload(nextItem)", html);
        Assert.Contains("query.get('debug') === '1'", html);
        Assert.Contains("body.debug #video-window", html);
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
