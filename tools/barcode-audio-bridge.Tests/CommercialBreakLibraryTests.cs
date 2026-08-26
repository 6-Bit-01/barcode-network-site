using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakLibraryTests
{
    [Fact]
    public void ActiveFolderIsTheEligibilitySwitchAndInactiveFilesAreIgnored()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("eligible-a.mp4");
        fixture.AddActiveSponsor("eligible-b.MP4");
        fixture.AddInactiveSponsor("former-sponsor.mp4");
        TemporaryCommercialLibrary.AddFile(fixture.ActiveDirectory, "notes.txt");
        var durations = new TestDurationReader()
            .With("eligible-a.mp4", 30)
            .With("eligible-b.MP4", 75);

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.True(result.Success, result.Message);
        Assert.Equal(new[] { "eligible-a", "eligible-b" }, result.Sponsors.Select(sponsor => sponsor.Name).ToArray());
        Assert.DoesNotContain(result.Sponsors, sponsor => sponsor.Name == "former-sponsor");
        Assert.NotNull(result.FixedClips);
    }

    [Fact]
    public void MissingFixedFileBlocksTheBreakWithTheExactMissingName()
    {
        using var fixture = new TemporaryCommercialLibrary();
        File.Delete(Path.Combine(fixture.FixedDirectory, "breaker-2.mp4"));
        fixture.AddActiveSponsor("sponsor.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("breaker-2.mp4", result.Message);
    }

    [Fact]
    public void UnreadableFixedFileBlocksTheBreak()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("sponsor.mp4");
        var durations = new TestDurationReader().Fail("intro.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.False(result.Success);
        Assert.Contains("intro.mp4", result.Message);
        Assert.Contains("fixture unreadable", result.Message);
    }

    [Fact]
    public void UnreadableSponsorIsSkippedWithoutCrashingOtherEligibleFiles()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddActiveSponsor("good.mp4");
        fixture.AddActiveSponsor("bad.mp4");
        var durations = new TestDurationReader().With("good.mp4", 40).Fail("bad.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, durations).Load();

        Assert.True(result.Success, result.Message);
        Assert.Single(result.Sponsors);
        Assert.Equal("good", result.Sponsors[0].Name);
        var warning = Assert.Single(result.Warnings);
        Assert.Contains("bad.mp4", warning);
    }

    [Fact]
    public void NoReadableActiveSponsorFailsClearly()
    {
        using var fixture = new TemporaryCommercialLibrary();
        fixture.AddInactiveSponsor("inactive.mp4");

        var result = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()).Load();

        Assert.False(result.Success);
        Assert.Contains("Sponsors\\Active", result.Message);
    }

    [Fact]
    public void EnsureLayoutCreatesTheDropInFolderStructureAndInstructions()
    {
        using var fixture = new TemporaryCommercialLibrary(createFixed: false);
        Directory.Delete(fixture.RootDirectory, recursive: true);
        var library = new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader());

        library.EnsureLayout();

        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Fixed")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Active")));
        Assert.True(Directory.Exists(Path.Combine(fixture.RootDirectory, "Sponsors", "Inactive")));
        var instructions = Path.Combine(fixture.RootDirectory, "README.txt");
        Assert.True(File.Exists(instructions));
        Assert.Contains("Start Commercial Break", File.ReadAllText(instructions));
    }
}
