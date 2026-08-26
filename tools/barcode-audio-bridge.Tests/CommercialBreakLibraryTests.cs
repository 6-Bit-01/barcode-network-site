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
        Assert.Equal("image/png", result.Visuals.StartEndIcon.ContentType);
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
    public void StartAndEndNamesAreCaseInsensitiveAndBumpersStayInTheirExistingFolder()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("sponsor.mp4");
        File.Move(
            Path.Combine(fixture.FixedDirectory, "START.mp4"),
            Path.Combine(fixture.FixedDirectory, "start.MP4"));

        var caseInsensitive = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.True(caseInsensitive.Success, caseInsensitive.Message);

        foreach (var path in Directory.EnumerateFiles(fixture.BumpersDirectory).Skip(2)) File.Delete(path);
        var missing = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missing.Success);
        Assert.Contains("At least 3", missing.Message);
        Assert.Contains("Fixed\\Bumpers", missing.Message);
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
    public void TaggedClipRequiresItsVisualsLogoAndEveryBreakRequiresBothVisualVideosAndIcon()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        fixture.AddActiveSponsor("fake (BL).mp4");
        File.Delete(Directory.EnumerateFiles(fixture.BlLogosDirectory).Single());

        var missingLogo = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingLogo.Success);
        Assert.Contains("Visuals\\Logos\\BL", missingLogo.Message);

        TemporaryCommercialLibrary.AddFile(fixture.BlLogosDirectory, "BL.png");
        File.Delete(fixture.BackgroundPath);
        var missingBackground = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingBackground.Success);
        Assert.Contains("Visuals\\Background", missingBackground.Message);

        TemporaryCommercialLibrary.AddFile(fixture.BackgroundDirectory, "BG.mp4");
        File.Delete(fixture.TvPath);
        var missingFrame = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingFrame.Success);
        Assert.Contains("Visuals\\TV Overlay", missingFrame.Message);

        TemporaryCommercialLibrary.AddFile(fixture.TvOverlayDirectory, "TV.mp4");
        File.Delete(fixture.IconPath);
        TemporaryCommercialLibrary.AddFile(fixture.RootDirectory, "ICON.png");
        var missingIcon = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.False(missingIcon.Success);
        Assert.Contains("Visuals\\ICON.png", missingIcon.Message);
    }

    [Fact]
    public void BcnTaggedContentRequiresTwoImagesInItsExistingLogoFolder()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        fixture.AddActiveSponsor("fake (BCN).mp4");
        File.Delete(Path.Combine(fixture.BcnLogosDirectory, "BCN2.png"));

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("2 BCN logo images", result.Message);
        Assert.Contains("Visuals\\Logos\\BCN", result.Message);
    }

    [Fact]
    public void StillImagesDoNotSatisfyTheAnimatedBackgroundContract()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        File.Delete(fixture.BackgroundPath);
        TemporaryCommercialLibrary.AddFile(fixture.BackgroundDirectory, "background.png");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("background video", result.Message);
    }

    [Fact]
    public void IdleBackgroundCanLoadWithoutBuildingOrStartingACommercialBreak()
    {
        using var fixture = new TemporaryCommercialLibrary();
        var library = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader());

        var background = library.GetIdleBackground();

        Assert.NotNull(background);
        Assert.Equal(fixture.BackgroundPath, background!.FilePath);
        Assert.Equal("video/mp4", background.ContentType);
    }

    [Fact]
    public void ExactTvFileWinsWhenExtraOverlayVideosExistAndAmbiguousFoldersFailClosed()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real.mp4");
        TemporaryCommercialLibrary.AddFile(fixture.TvOverlayDirectory, "A-WRONG.mp4");

        var exact = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.True(exact.Success, exact.Message);
        Assert.Equal("TV", exact.Visuals!.TvOverlay.Name);
        Assert.Contains(exact.Warnings, warning => warning.Contains("locked to TV.mp4"));

        File.Delete(fixture.TvPath);
        TemporaryCommercialLibrary.AddFile(fixture.TvOverlayDirectory, "Z-ALSO-WRONG.mp4");
        var ambiguous = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(ambiguous.Success);
        Assert.Contains("Multiple TV overlay videos", ambiguous.Message);
        Assert.Contains("TV.mp4", ambiguous.Message);
    }

    [Fact]
    public void VeoMarkedClipRequiresBothExactCornerLogosInTheirDedicatedFolder()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("Alux.mp4");
        File.Delete(Path.Combine(fixture.CornerLogosDirectory, "CORNERLOGO2.png"));

        var missing = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(missing.Success);
        Assert.Contains("CORNERLOGO1.png and CORNERLOGO2.png", missing.Message);
        Assert.Contains("Visuals\\Corner Logos", missing.Message);

        TemporaryCommercialLibrary.AddFile(fixture.CornerLogosDirectory, "CORNERLOGO2.png");
        var complete = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();
        Assert.True(complete.Success, complete.Message);
        Assert.True(Assert.Single(complete.Sponsors).ShowCornerLogo);
        Assert.Equal(2, complete.Visuals!.CornerLogos.Count);
    }

    [Fact]
    public void GrayeyeSponsorReceivesCornerLogoCoverage()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("grayeye.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.True(result.Success, result.Message);
        var grayeye = Assert.Single(result.Sponsors);
        Assert.Equal("grayeye", grayeye.Name);
        Assert.True(grayeye.ShowCornerLogo);
    }

    [Fact]
    public void CopyrightWarsBcnReplacesTheOldRCornerLogoMatcher()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("real-sponsor.mp4");
        fixture.AddActiveSponsor("CopyrightWars(BCN).mp4");
        fixture.AddActiveSponsor("CopyrightWars(R).mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.True(result.Success, result.Message);
        var copyrightWars = result.Interstitials.Single(clip => clip.Name == "CopyrightWars(BCN)");
        Assert.Equal(CommercialLogoBrand.Bcn, copyrightWars.LogoBrand);
        Assert.True(copyrightWars.ShowCornerLogo);
        Assert.False(result.Interstitials.Single(clip => clip.Name == "CopyrightWars(R)").ShowCornerLogo);
    }

    [Fact]
    public void EnsureLayoutPreservesTheEstablishedBumperAndVisualsFolders()
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
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Corner Logos")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Logos", "BCN")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Logos", "BL")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Visuals", "Logos", "R")));
        var instructions = Path.Combine(fixture.RootDirectory, "README.txt");
        Assert.True(File.Exists(instructions));
        var text = File.ReadAllText(instructions);
        Assert.Contains("START.mp4", text);
        Assert.Contains("Fixed\\Bumpers", text);
        Assert.Contains("Visuals\\Background", text);
        Assert.Contains("Visuals\\TV Overlay", text);
        Assert.Contains("Visuals\\Corner Logos", text);
        Assert.Contains("CORNERLOGO1.png", text);
        Assert.Contains("ICON.png", text);
        Assert.Contains("1080 x 1920", text);
        Assert.Contains("https://www.barcode-network.com/overlay/commercials", text);
        Assert.DoesNotContain("  http://127.0.0.1:43120/commercials", text);
    }
}
