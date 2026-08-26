using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakServiceTests
{
    [Fact]
    public void StartQueuesOneFrozenPlanAndRejectsASecondStartUntilCompletion()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));

        var first = service.Start();
        fixture.AddActiveSponsor("late-addition.mp4");
        var second = service.Start();
        var snapshot = service.Snapshot();

        Assert.True(first.Started, first.Message);
        Assert.False(second.Started);
        Assert.Equal("queued", snapshot.Status);
        Assert.Equal(4, snapshot.SponsorCount);
        Assert.Equal(9, snapshot.Items.Count);
        Assert.DoesNotContain(snapshot.Items, item => item.Name == "late-addition");
        Assert.False(service.CanStart);
        Assert.True(service.CanStop);
    }

    [Fact]
    public void PlayerProgressAndCompletionAreGenerationAndDirectionFenced()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var queued = service.Snapshot();

        Assert.False(service.MarkClipStarted(queued.Generation + 1, 0));
        Assert.True(service.MarkClipStarted(queued.Generation, 2));
        Assert.False(service.MarkClipStarted(queued.Generation, 1));
        var playing = service.Snapshot();
        Assert.Equal("playing", playing.Status);
        Assert.Equal(2, playing.CurrentIndex);

        Assert.False(service.MarkCompleted(queued.Generation + 1));
        Assert.True(service.MarkCompleted(queued.Generation));
        var complete = service.Snapshot();
        Assert.Equal("completed", complete.Status);
        Assert.True(service.CanStart);
        Assert.False(service.CanStop);
    }

    [Fact]
    public void StopReturnsAnActiveBreakToIdleAndAllowsAReplacementPlan()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var firstGeneration = service.Snapshot().Generation;

        service.Stop();
        Assert.Equal("idle", service.Snapshot().Status);
        Assert.True(service.Start().Started);

        Assert.True(service.Snapshot().Generation > firstGeneration);
    }

    [Fact]
    public void FailedFolderScanDoesNotLeaveTheServiceLocked()
    {
        using var fixture = new TemporaryCommercialLibrary();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            new TestDurationReader()));

        var result = service.Start();

        Assert.False(result.Started);
        Assert.Equal("failed", service.Snapshot().Status);
        Assert.True(service.CanStart);
        Assert.False(service.CanStop);
    }

    [Fact]
    public void MediaLookupServesOnlyFrozenPlanVideosBothVisualLoopsAndSelectedLogos()
    {
        using var fixture = CreateReadyFixture();
        fixture.AddActiveSponsor("network trailer (BCN).mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var snapshot = service.Snapshot();
        var item = snapshot.Items[0];
        var tagged = snapshot.Items.Single(entry => entry.Name == "network trailer (BCN)");

        Assert.True(service.TryGetMedia(item.Id, out var video));
        Assert.Equal("video/mp4", video.ContentType);
        var backgroundId = snapshot.BackgroundUrl![snapshot.BackgroundUrl.LastIndexOf('/')..].TrimStart('/');
        Assert.True(service.TryGetMedia(backgroundId, out var background));
        Assert.Equal("video/mp4", background.ContentType);
        var tvOverlayId = snapshot.TvOverlayUrl![snapshot.TvOverlayUrl.LastIndexOf('/')..].TrimStart('/');
        Assert.True(service.TryGetMedia(tvOverlayId, out var tvOverlay));
        Assert.Equal("video/mp4", tvOverlay.ContentType);
        var logoId = tagged.LogoUrl![tagged.LogoUrl.LastIndexOf('/')..].TrimStart('/');
        Assert.True(service.TryGetMedia(logoId, out var logo));
        Assert.Equal("image/png", logo.ContentType);
        Assert.False(service.TryGetMedia("not-a-current-media-id", out _));
        Assert.Equal("barcode_commercial_break_v3", snapshot.Schema);
    }

    [Fact]
    public void BcnLogoAlternationContinuesAcrossBreaks()
    {
        using var fixture = CreateReadyFixture();
        fixture.AddActiveSponsor("network trailer (BCN).mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));

        Assert.True(service.Start().Started);
        var first = service.Snapshot();
        var firstLogo = first.Items.Single(entry => entry.Name == "network trailer (BCN)").LogoUrl;
        Assert.True(service.MarkCompleted(first.Generation));

        Assert.True(service.Start().Started);
        var second = service.Snapshot();
        var secondLogo = second.Items.Single(entry => entry.Name == "network trailer (BCN)").LogoUrl;

        Assert.NotEqual(firstLogo, secondLogo);
    }

    [Fact]
    public void MovingAnActiveFileDuringPlaybackOnlyChangesTheNextPlan()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var snapshot = service.Snapshot();
        var activeItem = snapshot.Items.Single(entry => entry.Name == "a");
        var originalPath = Path.Combine(fixture.ActiveDirectory, "a.mp4");
        var inactivePath = Path.Combine(fixture.InactiveDirectory, "a.mp4");

        File.Move(originalPath, inactivePath);

        Assert.True(service.TryGetMedia(activeItem.Id, out var frozenMedia));
        Assert.True(File.Exists(frozenMedia.FilePath));
        Assert.NotEqual(originalPath, frozenMedia.FilePath);
        Assert.True(service.MarkCompleted(snapshot.Generation));
        Assert.False(service.TryGetMedia(activeItem.Id, out _));

        fixture.AddActiveSponsor("replacement.mp4");
        Assert.True(service.Start().Started);
        Assert.DoesNotContain(service.Snapshot().Items, entry => entry.Name == "a");
    }

    private static TemporaryCommercialLibrary CreateReadyFixture()
    {
        var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("a.mp4");
        fixture.AddActiveSponsor("b.mp4");
        fixture.AddActiveSponsor("c.mp4");
        fixture.AddActiveSponsor("d.mp4");
        return fixture;
    }

    private static TestDurationReader Durations() => new TestDurationReader()
        .With("a.mp4", 30)
        .With("b.mp4", 45)
        .With("c.mp4", 60)
        .With("d.mp4", 35)
        .With("late-addition.mp4", 20)
        .With("network trailer (BCN).mp4", 25);
}
