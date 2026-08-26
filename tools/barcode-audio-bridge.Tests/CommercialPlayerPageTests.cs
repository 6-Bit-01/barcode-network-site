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
    public void VerticalStageLoopsMutedBackgroundAndRawTvOnlyDuringBreak()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("aspect-ratio: 9 / 16", html);
        Assert.Contains("id=\"background-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("id=\"tv-overlay-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("clearVisualVideo(backgroundVideo)", html);
        Assert.Contains("clearVisualVideo(tvOverlayVideo)", html);
        Assert.Contains("stage.hidden = true", html);
        Assert.Contains("stage.hidden = false", html);
    }

    [Fact]
    public void RawTvVideoIsMaskedAroundTheExactCommercialScreenWindow()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("-webkit-mask:", html);
        Assert.Contains("linear-gradient(#fff 0 0) top", html);
        Assert.Contains("clip-path: inset(.7% 5.6%", html);
        Assert.Contains("left: 14.69%", html);
        Assert.Contains("top: 13.06%", html);
        Assert.Contains("width: 70.31%", html);
        Assert.Contains("height: 66.11%", html);
        Assert.Contains("object-fit: contain", html);
    }

    [Fact]
    public void LogosFadeSlowlyAboveTheTvAndOnlyOneNextClipIsPreloaded()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("transition: opacity 1800ms ease", html);
        Assert.Contains("#logo.visible", html);
        Assert.Contains("top: 23.5%", html);
        Assert.Contains("let preloadPlayer = null", html);
        Assert.Contains("preload(nextItem)", html);
        Assert.Contains("query.get('debug') === '1'", html);
    }
}
