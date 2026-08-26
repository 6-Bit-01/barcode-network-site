using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerPageTests
{
    [Fact]
    public void PlayerIsTransparentAutomaticAndUsesOnlyTheLocalCommercialEndpoints()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("background: transparent", html);
        Assert.Contains("<video id=\"player\" preload=\"auto\" autoplay", html);
        Assert.Contains("/v1/commercials/state", html);
        Assert.Contains("/v1/commercials/clip-started", html);
        Assert.Contains("/v1/commercials/complete", html);
        Assert.Contains("/v1/commercials/failed", html);
        Assert.False(html.Contains("https://", StringComparison.OrdinalIgnoreCase));
        Assert.False(html.Contains("localStorage", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PlayerPreloadsOnlyOneNextClipAndSupportsDebugStatus()
    {
        var html = CommercialPlayerPage.Html;

        Assert.Contains("let preloadPlayer = null", html);
        Assert.Contains("preload(nextItem)", html);
        Assert.Contains("query.get('debug') === '1'", html);
    }
}
