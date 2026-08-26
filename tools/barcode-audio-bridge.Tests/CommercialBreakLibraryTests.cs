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
        Assert.Equal("video/mp4", result.Visuals!.Background.ContentType);
        Assert.Equal("video/mp4", result.Visuals.TvOverlay.ContentType);
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
    public void ExactFixedNamesAreCaseInsensitiveButAllSevenFilesAreRequired()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("sponsor.mp4");
        File.Move(
            Path.Combine(fixture.FixedDirectory, "START.mp4"),
            Path.Combine(fixture.FixedDirectory, "start.MP4"));

        var caseInsensitive = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.True(caseInsensitive.Success, caseInsensitive.Message);

        File.Delete(Path.Combine(fixture.FixedDirectory, "BUMPER5.mp4"));
        var missing = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missing.Success);
        Assert.Contains("BUMPER5.mp4", missing.Message);
    }

    [Fact]
    public void UnreadableStartBlocksTheBreak()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("sponsor.mp4");
        var durations = new TestDurationReader().Fail("START.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.False(result.Success);
        Assert.Contains("START.mp4", result.Message);
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
    public void TaggedClipRequiresItsRootLogoAndEveryBreakRequiresBgAndTv()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        fixture.AddActiveSponsor("fake (BL).mp4");
        File.Delete(Path.Combine(fixture.RootDirectory, "BL.png"));

        var missingLogo = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingLogo.Success);
        Assert.Contains("BL.png", missingLogo.Message);

        TemporaryCommercialLibrary.AddFile(fixture.RootDirectory, "BL.png");
        File.Delete(fixture.BackgroundPath);
        var missingBackground = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingBackground.Success);
        Assert.Contains("BG.mp4", missingBackground.Message);

        TemporaryCommercialLibrary.AddFile(fixture.RootDirectory, "BG.mp4");
        File.Delete(fixture.TvPath);
        var missingFrame = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingFrame.Success);
        Assert.Contains("TV.mp4", missingFrame.Message);
    }

    [Fact]
    public void BcnTaggedContentRequiresBothAlternatingRootLogos()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        fixture.AddActiveSponsor("fake (BCN).mp4");
        File.Delete(Path.Combine(fixture.RootDirectory, "BCN2.png"));

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("BCN1.png and BCN2.png", result.Message);
    }

    [Fact]
    public void EnsureLayoutCreatesOnlyTheSimpleDropInFoldersAndCurrentInstructions()
    {
        using var fixture = new TemporaryCommercialLibrary(createFixed: false);
        Directory.Delete(fixture.RootDirectory, recursive: true);
        var library = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader());

        library.EnsureLayout();

        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Fixed")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Active")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Inactive")));
        Assert.False(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals")));
        var instructions = Path.Combine(fixture.RootDirectory, "README.txt");
        Assert.True(File.Exists(instructions));
        var text = File.ReadAllText(instructions);
        Assert.Contains("START.mp4", text);
        Assert.Contains("BUMPER5.mp4", text);
        Assert.Contains("BG.mp4", text);
        Assert.Contains("TV.mp4", text);
        Assert.Contains("1080 x 1920", text);
    }
}
