using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakPlaylistTests
{
    [Fact]
    public void EverySponsorAppearsOnceBetweenStartThreeUniqueBumpersAndEnd()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip($"s{index}", 20 + index, CommercialClipKind.Sponsor))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, Array.Empty<CommercialClip>(), Visuals(), new Random(17));

        Assert.Equal("start", plan.Items[0].Id);
        Assert.Equal("end", plan.Items[^1].Id);
        var bumpers = plan.Items.Where(item => item.Kind == CommercialClipKind.Bumper).ToArray();
        Assert.Equal(3, bumpers.Length);
        Assert.Equal(3, bumpers.Select(item => item.Id).Distinct().Count());
        Assert.Equal(
            sponsors.Select(sponsor => sponsor.Id).OrderBy(id => id),
            plan.Items.Where(item => item.Kind == CommercialClipKind.Sponsor).Select(item => item.Id).OrderBy(id => id));
        Assert.Equal(4, plan.ContentBlockDurations.Count);
        Assert.All(plan.ContentBlockDurations, duration => Assert.True(duration > TimeSpan.Zero));
        Assert.Contains(plan.UsedVisualAssets, asset => asset.Id == "background");
        Assert.Contains(plan.UsedVisualAssets, asset => asset.Id == "tv-overlay");
        Assert.Contains(plan.UsedVisualAssets, asset => asset.Id == "start-end-icon");
        Assert.Equal("start-end-icon", plan.Items[0].LogoAssetId);
        Assert.Equal("start-end-icon", plan.Items[^1].LogoAssetId);
        Assert.All(
            plan.Items.Skip(1).SkipLast(1).Where(item => item.Kind != CommercialClipKind.Interstitial),
            item => Assert.Null(item.LogoAssetId));
    }

    [Fact]
    public void FakeCommercialsAndTrailersAreAlwaysDottedBetweenRealSponsors()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip($"s{index}", 30, CommercialClipKind.Sponsor))
            .ToArray();
        var house = new[]
        {
            Clip("house-bcn", 25, CommercialClipKind.Interstitial, CommercialLogoBrand.Bcn),
            Clip("house-bl", 25, CommercialClipKind.Interstitial, CommercialLogoBrand.Bl),
            Clip("house-r", 25, CommercialClipKind.Interstitial, CommercialLogoBrand.R),
        };

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, house, Visuals(), new Random(21));
        var content = plan.Items.Where(item => item.Kind is CommercialClipKind.Sponsor or CommercialClipKind.Interstitial).ToArray();

        Assert.Equal(3, content.Count(item => item.Kind == CommercialClipKind.Interstitial));
        for (var index = 0; index < content.Length; index += 1)
        {
            if (content[index].Kind != CommercialClipKind.Interstitial) continue;
            Assert.True(index > 0 && index < content.Length - 1);
            Assert.Equal(CommercialClipKind.Sponsor, content[index - 1].Kind);
            Assert.Equal(CommercialClipKind.Sponsor, content[index + 1].Kind);
        }
    }

    [Fact]
    public void ElevenMinuteTargetCutsOnlyTheThreeOwnerApprovedHouseClips()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip($"s{index}", 60, CommercialClipKind.Sponsor))
            .ToArray();
        var house = new[]
        {
            Clip("required", 60, CommercialClipKind.Interstitial, CommercialLogoBrand.Bcn),
            Clip("SPACE1", 60, CommercialClipKind.Interstitial, optionalCutPriority: 0),
            Clip("Alien", 60, CommercialClipKind.Interstitial, optionalCutPriority: 1),
            Clip("May", 60, CommercialClipKind.Interstitial, optionalCutPriority: 2),
        };

        var plan = CommercialBreakPlaylistBuilder.Build(
            Fixed(startSeconds: 15, bumperSeconds: 10, endSeconds: 15),
            sponsors,
            house,
            Visuals(),
            new Random(4));

        Assert.Equal(TimeSpan.FromMinutes(11), plan.TotalDuration);
        Assert.Equal(new[] { "SPACE1", "Alien" }, plan.OmittedInterstitials);
        Assert.Contains(plan.Items, item => item.Name == "required");
        Assert.Contains(plan.Items, item => item.Name == "May");
        Assert.Equal(8, plan.SponsorCount);
    }

    [Fact]
    public void BcnLogosAlternateInPlaybackOrderAndContinueFromSuppliedIndex()
    {
        var sponsors = Enumerable.Range(1, 7)
            .Select(index => Clip($"s{index}", 30, CommercialClipKind.Sponsor))
            .ToArray();
        var house = Enumerable.Range(1, 4)
            .Select(index => Clip($"bcn-{index}", 20, CommercialClipKind.Interstitial, CommercialLogoBrand.Bcn))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, house, Visuals(), new Random(11), bcnLogoIndex: 1);
        var logos = plan.Items
            .Where(item => item.Kind == CommercialClipKind.Interstitial)
            .Select(item => item.LogoAssetId)
            .ToArray();

        Assert.Equal(new[] { "bcn-logo-2", "bcn-logo-1", "bcn-logo-2", "bcn-logo-1" }, logos);
        Assert.Equal(1, plan.NextBcnLogoIndex);
    }

    [Fact]
    public void CornerLogosAlternateWithoutRepeatingAcrossMarkedClipsAndSelectedBumpers()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip(
                $"s{index}",
                30,
                CommercialClipKind.Sponsor,
                showCornerLogo: index is 1 or 3 or 6))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(
            Fixed(),
            sponsors,
            Array.Empty<CommercialClip>(),
            Visuals(),
            new Random(18),
            cornerLogoIndex: 1);
        var marked = plan.Items
            .Where(item => item.CornerLogoAssetId is not null)
            .Select(item => (item.CornerLogoAssetId, item.CornerLogoVariant))
            .ToArray();

        Assert.Equal(6, marked.Length);
        Assert.Equal(("corner-logo-2", 2), marked[0]);
        for (var index = 1; index < marked.Length; index += 1)
        {
            Assert.NotEqual(marked[index - 1], marked[index]);
        }
        Assert.All(
            plan.Items.Where(item => item.Kind == CommercialClipKind.Bumper),
            bumper => Assert.NotNull(bumper.CornerLogoAssetId));
        Assert.Equal(1, plan.NextCornerLogoIndex);
    }

    [Fact]
    public void EveryBumperInTheFiveFilePoolReceivesAlternatingCornerCoverageWhenSelected()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip($"s{index}", 30, CommercialClipKind.Sponsor))
            .ToArray();
        var observedBumpers = new HashSet<string>(StringComparer.Ordinal);

        for (var seed = 1; seed <= 64; seed += 1)
        {
            var plan = CommercialBreakPlaylistBuilder.Build(
                Fixed(),
                sponsors,
                Array.Empty<CommercialClip>(),
                Visuals(),
                new Random(seed),
                cornerLogoIndex: seed % 2);
            var bumpers = plan.Items.Where(item => item.Kind == CommercialClipKind.Bumper).ToArray();
            Assert.Equal(3, bumpers.Length);
            Assert.All(bumpers, bumper =>
            {
                Assert.NotNull(bumper.CornerLogoAssetId);
                Assert.NotNull(bumper.CornerLogoVariant);
                observedBumpers.Add(bumper.Id);
            });
            var markedVariants = plan.Items
                .Where(item => item.CornerLogoVariant.HasValue)
                .Select(item => item.CornerLogoVariant!.Value)
                .ToArray();
            for (var index = 1; index < markedVariants.Length; index += 1)
            {
                Assert.NotEqual(markedVariants[index - 1], markedVariants[index]);
            }
        }

        Assert.Equal(5, observedBumpers.Count);
    }

    [Fact]
    public void ThreeBumpersLandInDistinctEarlyMiddleAndLateRanges()
    {
        var sponsors = Enumerable.Range(1, 20)
            .Select(index => Clip($"s{index}", 30, CommercialClipKind.Sponsor))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, Array.Empty<CommercialClip>(), Visuals(), new Random(7));
        var totalContent = plan.ContentBlockDurations.Sum(duration => duration.TotalSeconds);
        var first = plan.ContentBlockDurations[0].TotalSeconds / totalContent;
        var second = plan.ContentBlockDurations.Take(2).Sum(duration => duration.TotalSeconds) / totalContent;
        var third = plan.ContentBlockDurations.Take(3).Sum(duration => duration.TotalSeconds) / totalContent;

        Assert.InRange(first, 0.15, 0.35);
        Assert.InRange(second, 0.40, 0.60);
        Assert.InRange(third, 0.65, 0.85);
    }

    [Fact]
    public void RandomSeedsChangeSponsorAndBumperOrderWithoutChangingMembership()
    {
        var sponsors = Enumerable.Range(1, 12)
            .Select(index => Clip($"s{index:00}", 30, CommercialClipKind.Sponsor))
            .ToArray();

        var first = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, Array.Empty<CommercialClip>(), Visuals(), new Random(1));
        var second = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, Array.Empty<CommercialClip>(), Visuals(), new Random(2));
        var firstOrder = string.Join(',', first.Items.Where(item => item.Kind == CommercialClipKind.Sponsor).Select(item => item.Id));
        var secondOrder = string.Join(',', second.Items.Where(item => item.Kind == CommercialClipKind.Sponsor).Select(item => item.Id));

        Assert.NotEqual(firstOrder, secondOrder);
        Assert.Equal(first.Items.Count, second.Items.Count);
        Assert.Equal(first.SponsorCount, second.SponsorCount);
    }

    [Fact]
    public void TooManyRequiredHouseClipsFailsInsteadOfStackingThemTogether()
    {
        var sponsors = Enumerable.Range(1, 3)
            .Select(index => Clip($"s{index}", 30, CommercialClipKind.Sponsor))
            .ToArray();
        var house = Enumerable.Range(1, 3)
            .Select(index => Clip($"house-{index}", 20, CommercialClipKind.Interstitial))
            .ToArray();

        var error = Assert.Throws<InvalidOperationException>(() =>
            CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, house, Visuals(), new Random(3)));

        Assert.Contains("cannot be separated", error.Message);
    }

    private static CommercialFixedClips Fixed(
        double startSeconds = 5,
        double bumperSeconds = 3,
        double endSeconds = 5) => new(
            Clip("start", startSeconds, CommercialClipKind.Start),
            Enumerable.Range(1, 5)
                .Select(index => Clip($"bumper-{index}", bumperSeconds, CommercialClipKind.Bumper))
                .ToArray(),
            Clip("end", endSeconds, CommercialClipKind.End));

    private static CommercialVisualAssets Visuals() => new(
        Asset("background", "video/mp4", ".mp4"),
        Asset("tv-overlay", "video/webm", ".webm"),
        Asset("start-end-icon", "image/png"),
        new Dictionary<CommercialLogoBrand, IReadOnlyList<CommercialVisualAsset>>
        {
            [CommercialLogoBrand.Bcn] = new[] { Asset("bcn-logo-1", "image/png"), Asset("bcn-logo-2", "image/png") },
            [CommercialLogoBrand.Bl] = new[] { Asset("bl-logo", "image/png") },
            [CommercialLogoBrand.R] = new[] { Asset("r-logo", "image/png") },
        },
        new[] { Asset("corner-logo-1", "image/png"), Asset("corner-logo-2", "image/png") });

    private static CommercialVisualAsset Asset(string id, string contentType, string extension = ".png") => new(
        id,
        id,
        $"C:\\fixture\\{id}{extension}",
        contentType);

    private static CommercialClip Clip(
        string id,
        double seconds,
        CommercialClipKind kind,
        CommercialLogoBrand? logoBrand = null,
        int? optionalCutPriority = null,
        bool showCornerLogo = false) => new(
            id,
            id,
            $"C:\\fixture\\{id}.mp4",
            TimeSpan.FromSeconds(seconds),
            kind,
            logoBrand,
            optionalCutPriority,
            showCornerLogo);
}
