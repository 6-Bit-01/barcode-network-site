using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerPageTests
{
    [Fact]
    public void PlayerIsTransparentAtIdleAndUsesOnlyLocalCommercialEndpoints()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("background: transparent", html);
        Assert.Contains("<video id=\"background-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("<video id=\"player\" preload=\"auto\" autoplay", html);
        Assert.Contains("<video id=\"tv-overlay-video\" preload=\"auto\" autoplay muted loop", html);
        Assert.Contains("state.backgroundUrl", html);
        Assert.Contains("state.tvOverlayUrl", html);
        Assert.Contains("startVisualVideo(backgroundVideo", html);
        Assert.Contains("startVisualVideo(tvOverlayVideo", html);
        Assert.Contains("item.logoUrl", html);
        Assert.Contains("/v1/commercials/state", html);
        Assert.Contains("/v1/commercials/clip-started", html);
        Assert.Contains("/v1/commercials/complete", html);
        Assert.Contains("/v1/commercials/failed", html);
        Assert.False(html.Contains("https://", StringComparison.OrdinalIgnoreCase));
        Assert.False(html.Contains("localStorage", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void LogosFadeSlowlyAboveTheVideoAndOnlyOneNextClipIsPreloaded()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("transition: opacity 1800ms ease", html);
        Assert.Contains("#logo.visible", html);
        Assert.Contains("top: 2.5%", html);
        Assert.Contains("for (const visualVideo of [backgroundVideo, tvOverlayVideo])", html);
        Assert.Contains("let preloadPlayer = null", html);
        Assert.Contains("preload(nextItem)", html);
        Assert.Contains("query.get('debug') === '1'", html);
    }
}
