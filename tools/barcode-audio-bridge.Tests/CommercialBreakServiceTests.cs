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
        Assert.Equal(3, snapshot.SponsorCount);
        Assert.Equal(8, snapshot.Items.Count);
        Assert.DoesNotContain(snapshot.Items, item => item.Name == "late-addition");
        Assert.False(service.CanStart);
        Assert.True(service.CanStop);
    }

    [Fact]
    public void PlayerProgressAndCompletionAreGenerationFenced()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var queued = service.Snapshot();

        Assert.False(service.MarkClipStarted(queued.Generation + 1, 0));
        Assert.True(service.MarkClipStarted(queued.Generation, 2));
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
    public void MediaLookupOnlyServesFilesFromTheFrozenCurrentPlan()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));
        Assert.True(service.Start().Started);
        var item = service.Snapshot().Items[0];

        Assert.True(service.TryGetMediaPath(item.Id, out var path));
        Assert.True(File.Exists(path));
        Assert.False(service.TryGetMediaPath("not-a-current-media-id", out _));
    }

    private static TemporaryCommercialLibrary CreateReadyFixture()
    {
        var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("a.mp4");
        fixture.AddActiveSponsor("b.mp4");
        fixture.AddActiveSponsor("c.mp4");
        return fixture;
    }

    private static TestDurationReader Durations() => new TestDurationReader()
        .With("a.mp4", 30)
        .With("b.mp4", 45)
        .With("c.mp4", 60)
        .With("late-addition.mp4", 20);
}
