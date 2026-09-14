using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakServiceTests
{
    [Fact]
    public void AFileMovedAfterPlanningIsNotReadIntoThePlaybackSnapshot()
    {
        using var fixture = CreateReadyFixture();
        var library = new CommercialBreakLibrary(fixture.RootDirectory, Durations());
        var loaded = library.Load();
        var plan = CommercialBreakPlaylistBuilder.Build(loaded.FixedClips!, loaded.Sponsors,
            loaded.Interstitials, loaded.Visuals!, new Random(0), 0, 0);
        var item = plan.Items.Single(entry => entry.Name == "a");
        var inactive = Path.Combine(fixture.InactiveDirectory, "a.mp4");
        File.Move(item.FilePath, inactive);
        using var lockedInactive = File.Open(inactive, FileMode.Open, FileAccess.Read, FileShare.None);
        using var snapshot = CommercialMediaSnapshot.Create(plan, library.PlaybackSnapshotsDirectory,
            (path, id) => library.IsActiveCommercial(path, id));
        Assert.False(snapshot.MediaById.ContainsKey(item.Id));
        Assert.True(snapshot.MediaById.ContainsKey(plan.Items.Single(entry => entry.Name == "b").Id));
    }

    [Fact]
    public void ReportedInactiveCommercialsAreNeverReadOrIncludedEvenWithOldPlaybackCopies()
    {
        using var fixture = CreateReadyFixture();
        var reader = Durations();
        var library = new CommercialBreakLibrary(fixture.RootDirectory, reader);
        // Simulate leftover copies; only the live Active scan may create a new plan.
        var oldCopies = Path.Combine(library.PlaybackSnapshotsDirectory, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(oldCopies);
        foreach (var name in new[] { "ForbesFiberLOW.mp4", "NovaCordova.mp4" })
        {
            fixture.AddInactiveSponsor(name);
            TemporaryCommercialLibrary.AddFile(oldCopies, name);
        }
        using var first = File.Open(Path.Combine(fixture.InactiveDirectory, "ForbesFiberLOW.mp4"), FileMode.Open, FileAccess.Read, FileShare.None);
        using var second = File.Open(Path.Combine(fixture.InactiveDirectory, "NovaCordova.mp4"), FileMode.Open, FileAccess.Read, FileShare.None);
        var service = new CommercialBreakService(library);
        service.Snapshot(playerHeartbeat: true);
        Assert.Equal(new[] { "a.mp4", "b.mp4", "c.mp4", "d.mp4" }, service.Preflight().ActiveFileNames);
        Assert.True(service.Start(requireConnectedPlayer: true).Started);
        Assert.Equal(new[] { "a", "b", "c", "d" }, service.Snapshot().Items.Where(item => item.Kind == "sponsor").Select(item => item.Name).Order());
        Assert.DoesNotContain(reader.ReadPaths, path => path.Contains("Inactive") || path.Contains("Playback Snapshots"));
        Assert.DoesNotContain(reader.ReadPaths, path => Path.GetFileName(path) is "ForbesFiberLOW.mp4" or "NovaCordova.mp4");
        Assert.True(service.MarkCompleted(service.Snapshot().Generation));
        Assert.True(service.Start().Started, "tray starts use the same Active-only selection");
        Assert.DoesNotContain(service.Snapshot().Items, item => item.Name is "ForbesFiberLOW" or "NovaCordova");
        service.Stop();
    }

    [Fact]
    public void ACommercialMovedWhilePlayingIsExcludedButTheNextClipCanStillPlay()
    {
        using var fixture = CreateReadyFixture();
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, Durations()));
        Assert.True(service.Start().Started);
        var state = service.Snapshot();
        var index = state.Items.ToList().FindIndex(item => item.Kind == "sponsor");
        Assert.True(service.MarkClipStarted(state.Generation, index));
        var item = state.Items[index];
        File.Move(Path.Combine(fixture.ActiveDirectory, item.Name + ".mp4"), Path.Combine(fixture.InactiveDirectory, item.Name + ".mp4"));
        Assert.True(service.Snapshot().Items[index].Excluded);
        Assert.False(service.TryGetMedia(item.Id, out _));
        Assert.True(service.MarkClipStarted(state.Generation, index + 1));
        Assert.Equal("playing", service.Snapshot().Status);
        service.Stop();
    }

    [Fact]
    public void PreflightRequiresARealPlayerHeartbeatAndDoesNotStartOrRenewIt()
    {
        using var fixture = CreateReadyFixture();
        var now = DateTimeOffset.Parse("2026-09-13T12:00:00Z");
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, Durations()), () => now);
        Assert.False(service.Preflight().PlayerConnected);
        Assert.False(service.Start(requireConnectedPlayer: true).Started);
        service.Snapshot(playerHeartbeat: true);
        var ready = service.Preflight();
        Assert.True(ready.Ready, ready.Message);
        Assert.Equal(4, ready.SponsorCount);
        Assert.Equal("idle", service.Snapshot().Status);
        Assert.Equal(0, service.Snapshot().Generation);
        now += TimeSpan.FromSeconds(6);
        Assert.False(service.Preflight().PlayerConnected);
        Assert.False(service.Start(requireConnectedPlayer: true).Started);
        Assert.Equal("idle", service.Snapshot().Status);
    }

    [Fact]
    public void PreflightValidatesTheActualActiveFolderAndStartRescansIt()
    {
        using var fixture = CreateReadyFixture();
        fixture.AddInactiveSponsor("old-sponsor.mp4");
        var nested = Path.Combine(fixture.ActiveDirectory, "Inactive");
        Directory.CreateDirectory(nested);
        TemporaryCommercialLibrary.AddFile(nested, "nested-old.mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, Durations()));
        service.Snapshot(playerHeartbeat: true);
        var preflight = service.Preflight();
        Assert.True(preflight.Ready, preflight.Message);
        Assert.Equal(new[] { "a.mp4", "b.mp4", "c.mp4", "d.mp4" }, preflight.ActiveFileNames);
        File.Move(Path.Combine(fixture.ActiveDirectory, "a.mp4"), Path.Combine(fixture.InactiveDirectory, "a.mp4"));
        fixture.AddActiveSponsor("replacement.mp4"); // Keep the established four content blocks valid.
        service.Snapshot(playerHeartbeat: true);
        var started = service.Start(requireConnectedPlayer: true);
        Assert.True(started.Started, started.Message);
        Assert.DoesNotContain(service.Snapshot().Items, item => item.Name is "a" or "old-sponsor" or "nested-old");
        Assert.False(service.Preflight().Ready, "preflight cannot allow a duplicate while queued");
    }

    [Fact]
    public void MissingFixedMediaIsRejectedByPreflightWithoutChangingPlaybackState()
    {
        using var fixture = new TemporaryCommercialLibrary(createFixed: false);
        fixture.AddActiveSponsor("a.mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, Durations()));
        service.Snapshot(playerHeartbeat: true);
        var result = service.Preflight();
        Assert.False(result.Ready);
        Assert.True(result.PlayerConnected);
        Assert.Contains("START.mp4", result.Message);
        Assert.Equal("idle", service.Snapshot().Status);
        Assert.Equal(0, service.Snapshot().Generation);
    }

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
        var ending = snapshot.Items[^1];
        var tagged = snapshot.Items.Single(entry => entry.Name == "network trailer (BCN)");

        Assert.True(service.TryGetMedia(item.Id, out var video));
        Assert.Equal("video/mp4", video.ContentType);
        var backgroundId = MediaId(snapshot.BackgroundUrl!);
        Assert.True(service.TryGetMedia(backgroundId, out var background));
        Assert.Equal("video/mp4", background.ContentType);
        var tvOverlayId = MediaId(snapshot.TvOverlayUrl!);
        Assert.True(service.TryGetMedia(tvOverlayId, out var tvOverlay));
        Assert.Equal("video/mp4", tvOverlay.ContentType);
        var logoId = MediaId(tagged.LogoUrl!);
        Assert.True(service.TryGetMedia(logoId, out var logo));
        Assert.Equal("image/png", logo.ContentType);
        Assert.NotNull(item.LogoUrl);
        Assert.Equal(item.LogoUrl, ending.LogoUrl);
        var iconId = MediaId(item.LogoUrl!);
        Assert.True(service.TryGetMedia(iconId, out var icon));
        Assert.Equal("image/png", icon.ContentType);
        Assert.False(service.TryGetMedia("not-a-current-media-id", out _));
        Assert.Equal("bcn", tagged.LogoBrand);
        Assert.Equal("barcode_commercial_break_v6", snapshot.Schema);
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
    public void CornerLogoRunsStayConstantAndAlternateAcrossBreakBoundariesAndAssetsAreFrozen()
    {
        using var fixture = CreateReadyFixture();
        fixture.AddActiveSponsor("Alux.mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(
            fixture.RootDirectory,
            Durations()));

        Assert.True(service.Start().Started);
        var first = service.Snapshot();
        var firstMarked = first.Items.Where(entry => entry.CornerLogoVariant.HasValue).ToArray();
        Assert.Equal(4, firstMarked.Length);
        AssertCornerLogoRuns(first.Items);
        Assert.All(first.Items.Where(entry => entry.Kind == "bumper"), entry => Assert.NotNull(entry.CornerLogoUrl));
        var firstAlux = first.Items.Single(entry => entry.Name == "Alux");
        var firstCorner = firstAlux.CornerLogoUrl;
        Assert.NotNull(firstCorner);
        var firstCornerId = MediaId(firstCorner!);
        Assert.True(service.TryGetMedia(firstCornerId, out var cornerAsset));
        Assert.Equal("image/png", cornerAsset.ContentType);
        Assert.True(service.MarkCompleted(first.Generation));

        Assert.True(service.Start().Started);
        var second = service.Snapshot();
        var secondMarked = second.Items.Where(entry => entry.CornerLogoVariant.HasValue).ToArray();
        Assert.Equal(4, secondMarked.Length);
        AssertCornerLogoRuns(second.Items);

        Assert.NotEqual(firstMarked[^1].CornerLogoVariant, secondMarked[0].CornerLogoVariant);
    }

    [Fact]
    public void MovingAnActiveFileToInactiveRevokesItsSnapshotWithoutStoppingTheBreak()
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

        Assert.True(service.TryGetMedia(activeItem.Id, out var frozenMedia));
        Assert.NotEqual(originalPath, frozenMedia.FilePath);
        File.Move(originalPath, inactivePath);

        Assert.True(File.Exists(frozenMedia.FilePath), "snapshots remain supported");
        Assert.False(service.TryGetMedia(activeItem.Id, out _));
        var index = snapshot.Items.ToList().FindIndex(item => item.Id == activeItem.Id);
        Assert.False(service.MarkClipStarted(snapshot.Generation, index, out var skipped));
        Assert.True(skipped);
        Assert.True(service.Snapshot().Items.Single(item => item.Id == activeItem.Id).Excluded);
        Assert.Equal("queued", service.Snapshot().Status);
        Assert.True(service.TryGetMedia(snapshot.Items[^1].Id, out _));
        Assert.True(service.MarkCompleted(snapshot.Generation));
        Assert.False(service.TryGetMedia(activeItem.Id, out _));

        fixture.AddActiveSponsor("replacement.mp4");
        Assert.True(service.Start().Started);
        Assert.DoesNotContain(service.Snapshot().Items, entry => entry.Name == "a");
    }

    private static string MediaId(string url) => new Uri(new Uri("http://localhost"), url).AbsolutePath.Split('/')[^1];

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
        .With("network trailer (BCN).mp4", 25)
        .With("Alux.mp4", 30);

    private static void AssertCornerLogoRuns(IReadOnlyList<CommercialPlaybackItemSnapshot> items)
    {
        int? previousVariant = null;
        int? previousRunVariant = null;
        var previousWasMarked = false;

        foreach (var item in items)
        {
            if (item.CornerLogoVariant is not { } variant)
            {
                previousVariant = null;
                previousWasMarked = false;
                continue;
            }

            if (previousWasMarked)
            {
                Assert.Equal(previousVariant, variant);
            }
            else
            {
                if (previousRunVariant.HasValue) Assert.NotEqual(previousRunVariant, variant);
                previousRunVariant = variant;
            }
            previousVariant = variant;
            previousWasMarked = true;
        }
    }
}
