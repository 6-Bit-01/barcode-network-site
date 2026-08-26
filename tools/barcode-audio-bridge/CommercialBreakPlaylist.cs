namespace Barcode.AudioBridge;

internal enum CommercialClipKind
{
    Intro,
    Sponsor,
    Breaker,
    End,
}

internal sealed record CommercialClip(
    string Id,
    string Name,
    string FilePath,
    TimeSpan Duration,
    CommercialClipKind Kind);

internal sealed record CommercialFixedClips(
    CommercialClip Intro,
    IReadOnlyList<CommercialClip> Breakers,
    CommercialClip End);

internal sealed record CommercialPlaylistItem(
    string Id,
    string Name,
    string FilePath,
    TimeSpan Duration,
    CommercialClipKind Kind,
    int? SponsorBlock);

internal sealed record CommercialBreakPlan(
    IReadOnlyList<CommercialPlaylistItem> Items,
    IReadOnlyList<TimeSpan> SponsorBlockDurations,
    int SponsorCount,
    TimeSpan SponsorDuration,
    TimeSpan TotalDuration);

internal static class CommercialBreakPlaylistBuilder
{
    public const int SponsorBlockCount = 4;
    public const int BreakerCount = SponsorBlockCount - 1;

    public static CommercialBreakPlan Build(
        CommercialFixedClips fixedClips,
        IReadOnlyList<CommercialClip> sponsors,
        Random random)
    {
        ArgumentNullException.ThrowIfNull(fixedClips);
        ArgumentNullException.ThrowIfNull(sponsors);
        ArgumentNullException.ThrowIfNull(random);

        if (fixedClips.Breakers.Count != BreakerCount)
        {
            throw new ArgumentException($"Exactly {BreakerCount} fixed breakers are required.", nameof(fixedClips));
        }

        if (sponsors.Any(clip => clip.Kind != CommercialClipKind.Sponsor))
        {
            throw new ArgumentException("Every sponsor input must use the Sponsor clip kind.", nameof(sponsors));
        }

        // Longest-processing-time bin packing gives a close runtime balance without
        // cutting, repeating, or modifying any sponsor. Random tie-breaks prevent one
        // permanent arrangement when equally good placements exist.
        var randomizedSponsors = sponsors
            .Select(clip => new RandomizedClip(clip, random.Next()))
            .OrderByDescending(item => item.Clip.Duration)
            .ThenBy(item => item.TieBreaker)
            .ToList();

        var blocks = Enumerable.Range(0, SponsorBlockCount)
            .Select(_ => new SponsorBlock())
            .ToList();

        foreach (var item in randomizedSponsors)
        {
            var shortestTicks = blocks.Min(block => block.Duration.Ticks);
            var shortestBlocks = blocks
                .Where(block => block.Duration.Ticks == shortestTicks)
                .ToList();
            var selected = shortestBlocks[random.Next(shortestBlocks.Count)];
            selected.Clips.Add(item.Clip);
            selected.Duration += item.Clip.Duration;
        }

        // Balance first, then shuffle block positions and clip order. This keeps the
        // timing result while avoiding the same sponsor sequence on every break.
        Shuffle(blocks, random);
        foreach (var block in blocks)
        {
            Shuffle(block.Clips, random);
        }

        var playlist = new List<CommercialPlaylistItem>
        {
            ToPlaylistItem(fixedClips.Intro, sponsorBlock: null),
        };

        for (var blockIndex = 0; blockIndex < blocks.Count; blockIndex += 1)
        {
            foreach (var sponsor in blocks[blockIndex].Clips)
            {
                playlist.Add(ToPlaylistItem(sponsor, blockIndex + 1));
            }

            if (blockIndex < fixedClips.Breakers.Count)
            {
                playlist.Add(ToPlaylistItem(fixedClips.Breakers[blockIndex], sponsorBlock: null));
            }
        }

        playlist.Add(ToPlaylistItem(fixedClips.End, sponsorBlock: null));

        return new CommercialBreakPlan(
            playlist,
            blocks.Select(block => block.Duration).ToArray(),
            sponsors.Count,
            SumClipDurations(sponsors),
            SumPlaylistDurations(playlist));
    }

    private static CommercialPlaylistItem ToPlaylistItem(CommercialClip clip, int? sponsorBlock) => new(
        clip.Id,
        clip.Name,
        clip.FilePath,
        clip.Duration,
        clip.Kind,
        sponsorBlock);

    private static TimeSpan SumClipDurations(IEnumerable<CommercialClip> clips) =>
        TimeSpan.FromTicks(clips.Sum(clip => clip.Duration.Ticks));

    private static TimeSpan SumPlaylistDurations(IEnumerable<CommercialPlaylistItem> clips) =>
        TimeSpan.FromTicks(clips.Sum(clip => clip.Duration.Ticks));

    private static void Shuffle<T>(IList<T> items, Random random)
    {
        for (var index = items.Count - 1; index > 0; index -= 1)
        {
            var swapIndex = random.Next(index + 1);
            (items[index], items[swapIndex]) = (items[swapIndex], items[index]);
        }
    }

    private sealed record RandomizedClip(CommercialClip Clip, int TieBreaker);

    private sealed class SponsorBlock
    {
        public List<CommercialClip> Clips { get; } = new();
        public TimeSpan Duration { get; set; }
    }
}
