using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakLibraryTests
{
    [Fact]
    public void ActiveFolderControlsEligibilityAndParenthesesSeparateHouseContentFromSponsors()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("eligible-a.mp4");
        fixture.AddActiveSponsor("BARCODE trailer (BCN).MP4");
        fixture.AddInactiveSponsor("former-sponsor.mp4");
        TemporaryCommercialLibrary.AddFile(fixture.ActiveDirectory, "notes.txt");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.True(result.Success, result.Message);
        var sponsor = Assert.Single(result.Sponsors);
        Assert.Equal("eligible-a", sponsor.Name);
        var house = Assert.Single(result.Interstitials);
        Assert.Equal(CommercialLogoBrand.Bcn, house.LogoBrand);
        Assert.DoesNotContain(result.Sponsors, clip => clip.Name == "former-sponsor");
        Assert.NotNull(result.FixedClips);
        Assert.NotNull(result.Visuals);
    }

    [Fact]
    public void KnownTagsMapToBrandsAndApprovedCutNamesRemainHouseContentWithoutParentheses()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real-sponsor.mp4");
        fixture.AddActiveSponsor("one (BL).mp4");
        fixture.AddActiveSponsor("two (R).mp4");
        fixture.AddActiveSponsor("SPACE1.mp4");
        fixture.AddActiveSponsor("Alien (BCN).mp4");
        fixture.AddActiveSponsor("May.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.True(result.Success, result.Message);
        Assert.Single(result.Sponsors);
        Assert.Equal(5, result.Interstitials.Count);
        Assert.Equal(CommercialLogoBrand.Bl, result.Interstitials.Single(clip => clip.Name == "one (BL)").LogoBrand);
        Assert.Equal(CommercialLogoBrand.R, result.Interstitials.Single(clip => clip.Name == "two (R)").LogoBrand);
        Assert.Equal(0, result.Interstitials.Single(clip => clip.Name == "SPACE1").OptionalCutPriority);
        Assert.Equal(1, result.Interstitials.Single(clip => clip.Name == "Alien (BCN)").OptionalCutPriority);
        Assert.Equal(2, result.Interstitials.Single(clip => clip.Name == "May").OptionalCutPriority);
    }

    [Fact]
    public void MissingStartBlocksTheBreakWithTheExactName()
    {
        using var fixture = new TemporaryCommercialLibrary();
        File.Delete(Path.Combine(fixture.FixedDirectory, "start.mp4"));
        fixture.AddActiveSponsor("sponsor.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("start.mp4", result.Message);
    }

    [Fact]
    public void FewerThanThreeBumpersBlocksTheBreak()
    {
        using var fixture = new TemporaryCommercialLibrary();
        foreach (var path in Directory.EnumerateFiles(fixture.BumpersDirectory).Skip(2)) File.Delete(path);
        fixture.AddActiveSponsor("sponsor.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("At least 3", result.Message);
        Assert.Contains("Fixed\\Bumpers", result.Message);
    }

    [Fact]
    public void UnreadableStartBlocksTheBreak()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("sponsor.mp4");
        var durations = new TestDurationReader().Fail("start.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.False(result.Success);
        Assert.Contains("start.mp4", result.Message);
        Assert.Contains("fixture unreadable", result.Message);
    }

    [Fact]
    public void UnreadableActiveFileIsSkippedWithoutCrashingOtherEligibleFiles()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("good.mp4");
        fixture.AddActiveSponsor("bad.mp4");
        var durations = new TestDurationReader().With("good.mp4", 40).Fail("bad.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.True(result.Success, result.Message);
        Assert.Single(result.Sponsors);
        Assert.Equal("good", result.Sponsors[0].Name);
        Assert.Contains(result.Warnings, warning => warning.Contains("bad.mp4"));
    }

    [Fact]
    public void TaggedClipRequiresItsLogoAndEveryBreakRequiresBothVisualVideos()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        fixture.AddActiveSponsor("fake (BL).mp4");
        File.Delete(Directory.EnumerateFiles(fixture.BlLogosDirectory).Single());

        var missingLogo = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(missingLogo.Success);
        Assert.Contains("Visuals\\Logos\\BL", missingLogo.Message);

        TemporaryCommercialLibrary.AddFile(fixture.BlLogosDirectory, "bl.png");
        File.Delete(Directory.EnumerateFiles(fixture.BackgroundDirectory).Single());
        var missingBackground = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(missingBackground.Success);
        Assert.Contains("Visuals\\Background", missingBackground.Message);

        TemporaryCommercialLibrary.AddFile(fixture.BackgroundDirectory, "background.mp4");
        File.Delete(Directory.EnumerateFiles(fixture.TvOverlayDirectory).Single());
        var missingTvOverlay = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(missingTvOverlay.Success);
        Assert.Contains("Visuals\\TV Overlay", missingTvOverlay.Message);
    }

    [Fact]
    public void StillImagesDoNotSatisfyTheAnimatedBackgroundOrTvOverlayContract()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        File.Delete(Directory.EnumerateFiles(fixture.BackgroundDirectory).Single());
        TemporaryCommercialLibrary.AddFile(fixture.BackgroundDirectory, "background.png");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("background video", result.Message);
    }

    [Fact]
    public void EnsureLayoutCreatesDropInFoldersAndCurrentInstructions()
    {
        using var fixture = new TemporaryCommercialLibrary(createFixed: false);
        Directory.Delete(fixture.RootDirectory, recursive: true);
        var library = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader());

        library.EnsureLayout();

        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Fixed", "Bumpers")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Active")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Inactive")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Background")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "TV Overlay")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Logos", "BCN")));
        var instructions = Path.Combine(fixture.RootDirectory, "README.txt");
        Assert.True(File.Exists(instructions));
        var text = File.ReadAllText(instructions);
        Assert.Contains("11:00", text);
        Assert.Contains("(BCN)", text);
        Assert.Contains("looping background video", text);
        Assert.Contains("Visuals\\TV Overlay", text);
    }
}
