using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialBreakPlaylistTests
{
    [Fact]
    public void EverySponsorAppearsOnceBetweenTheFixedIntroBreakersAndEnd()
    {
        var sponsors = Enumerable.Range(1, 8)
            .Select(index => Clip($"s{index}", 20 + index, CommercialClipKind.Sponsor))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, new Random(17));

        Assert.Equal("intro", plan.Items[0].Id);
        Assert.Equal("end", plan.Items[^1].Id);
        Assert.Equal(new[] { "b1", "b2", "b3" }, plan.Items
            .Where(item => item.Kind == CommercialClipKind.Breaker)
            .Select(item => item.Id)
            .ToArray());
        Assert.Equal(
            sponsors.Select(sponsor => sponsor.Id).OrderBy(id => id),
            plan.Items
                .Where(item => item.Kind == CommercialClipKind.Sponsor)
                .Select(item => item.Id)
                .OrderBy(id => id));
        Assert.Equal(sponsors.Length, plan.Items.Count(item => item.Kind == CommercialClipKind.Sponsor));
        Assert.All(
            plan.Items.Where(item => item.Kind == CommercialClipKind.Sponsor),
            item => Assert.InRange(item.SponsorBlock ?? 0, 1, 4));
    }

    [Fact]
    public void UnevenSponsorLengthsAreBalancedByRuntimeInsteadOfCount()
    {
        var durations = new[] { 90d, 75d, 60d, 45d, 40d, 30d, 30d, 20d };
        var sponsors = durations
            .Select((duration, index) => Clip($"s{index + 1}", duration, CommercialClipKind.Sponsor))
            .ToArray();

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, new Random(4));
        var shortest = plan.SponsorBlockDurations.Min(duration => duration.TotalSeconds);
        var longest = plan.SponsorBlockDurations.Max(duration => duration.TotalSeconds);

        Assert.Equal(390, plan.SponsorDuration.TotalSeconds);
        Assert.True(longest - shortest <= 15, $"block spread was {longest - shortest:F1} seconds");
        Assert.Equal(4, plan.SponsorBlockDurations.Count);
    }

    [Fact]
    public void BlockAndSponsorOrderChangesAcrossRandomSeedsWithoutChangingBalance()
    {
        var sponsors = Enumerable.Range(1, 12)
            .Select(index => Clip($"s{index:00}", 30, CommercialClipKind.Sponsor))
            .ToArray();

        var first = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, new Random(1));
        var second = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, new Random(2));
        var firstOrder = string.Join(',', first.Items.Where(item => item.Kind == CommercialClipKind.Sponsor).Select(item => item.Id));
        var secondOrder = string.Join(',', second.Items.Where(item => item.Kind == CommercialClipKind.Sponsor).Select(item => item.Id));

        Assert.NotEqual(firstOrder, secondOrder);
        Assert.All(first.SponsorBlockDurations, duration => Assert.Equal(90, duration.TotalSeconds));
        Assert.All(second.SponsorBlockDurations, duration => Assert.Equal(90, duration.TotalSeconds));
    }

    [Fact]
    public void FewerThanFourSponsorsLeavesEmptyBlocksWithoutRepeatingAnyone()
    {
        var sponsors = new[]
        {
            Clip("s1", 30, CommercialClipKind.Sponsor),
            Clip("s2", 45, CommercialClipKind.Sponsor),
        };

        var plan = CommercialBreakPlaylistBuilder.Build(Fixed(), sponsors, new Random(9));

        Assert.Equal(2, plan.SponsorCount);
        Assert.Equal(2, plan.Items.Count(item => item.Kind == CommercialClipKind.Sponsor));
        Assert.Equal(2, plan.SponsorBlockDurations.Count(duration => duration == TimeSpan.Zero));
        Assert.Equal(7, plan.Items.Count);
    }

    private static CommercialFixedClips Fixed() => new(
        Clip("intro", 5, CommercialClipKind.Intro),
        new[]
        {
            Clip("b1", 3, CommercialClipKind.Breaker),
            Clip("b2", 3, CommercialClipKind.Breaker),
            Clip("b3", 3, CommercialClipKind.Breaker),
        },
        Clip("end", 5, CommercialClipKind.End));

    private static CommercialClip Clip(string id, double seconds, CommercialClipKind kind) => new(
        id,
        id,
        $"C:\\fixture\\{id}.mp4",
        TimeSpan.FromSeconds(seconds),
        kind);
}
