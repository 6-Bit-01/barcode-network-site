namespace Barcode.AudioBridge;

internal enum CommercialClipKind
{
    Start,
    Sponsor,
    Interstitial,
    Bumper,
    End,
}

internal enum CommercialLogoBrand
{
    Bcn,
    Bl,
    R,
}

internal sealed record CommercialClip(
    string Id,
    string Name,
    string FilePath,
    TimeSpan Duration,
    CommercialClipKind Kind,
    CommercialLogoBrand? LogoBrand = null,
    int? OptionalCutPriority = null);

internal sealed record CommercialFixedClips(
    CommercialClip Start,
    IReadOnlyList<CommercialClip> Bumpers,
    CommercialClip End);

internal sealed record CommercialVisualAsset(
    string Id,
    string Name,
    string FilePath,
    string ContentType);

internal sealed record CommercialVisualAssets(
    CommercialVisualAsset Background,
    CommercialVisualAsset TvOverlay,
    IReadOnlyDictionary<CommercialLogoBrand, IReadOnlyList<CommercialVisualAsset>> Logos);

internal sealed record CommercialPlaylistItem(
    string Id,
    string Name,
    string FilePath,
    TimeSpan Duration,
    CommercialClipKind Kind,
    int? ContentBlock,
    string? LogoAssetId);

internal sealed record CommercialBreakPlan(
    IReadOnlyList<CommercialPlaylistItem> Items,
    IReadOnlyList<TimeSpan> ContentBlockDurations,
    IReadOnlyList<string> SelectedBumpers,
    IReadOnlyList<string> OmittedInterstitials,
    IReadOnlyList<CommercialVisualAsset> UsedVisualAssets,
    CommercialVisualAsset Background,
    CommercialVisualAsset TvOverlay,
    int SponsorCount,
    int InterstitialCount,
    TimeSpan SponsorDuration,
    TimeSpan TotalDuration,
    TimeSpan TargetDuration,
    int NextBcnLogoIndex);

internal static class CommercialBreakPlaylistBuilder
{
    public const int BumperCount = 3;
    public const int ContentBlockCount = BumperCount + 1;
    public static readonly TimeSpan TargetDuration = TimeSpan.FromMinutes(11);

    private static readonly (double Minimum, double Maximum)[] BumperPlacementRanges =
    {
        (0.20, 0.30),
        (0.45, 0.55),
        (0.70, 0.80),
    };

    public static CommercialBreakPlan Build(
        CommercialFixedClips fixedClips,
        IReadOnlyList<CommercialClip> sponsors,
        IReadOnlyList<CommercialClip> interstitials,
        CommercialVisualAssets visuals,
        Random random,
        int bcnLogoIndex = 0)
    {
        ArgumentNullException.ThrowIfNull(fixedClips);
        ArgumentNullException.ThrowIfNull(sponsors);
        ArgumentNullException.ThrowIfNull(interstitials);
        ArgumentNullException.ThrowIfNull(visuals);
        ArgumentNullException.ThrowIfNull(random);

        if (fixedClips.Bumpers.Count < BumperCount)
        {
            throw new ArgumentException($"At least {BumperCount} playable bumpers are required.", nameof(fixedClips));
        }
        if (sponsors.Count == 0 || sponsors.Any(clip => clip.Kind != CommercialClipKind.Sponsor))
        {
            throw new ArgumentException("At least one valid Sponsor clip is required.", nameof(sponsors));
        }
        if (interstitials.Any(clip => clip.Kind != CommercialClipKind.Interstitial))
        {
            throw new ArgumentException("Every house-content input must use the Interstitial clip kind.", nameof(interstitials));
        }

        var selection = SelectClosestToTarget(fixedClips, sponsors, interstitials, random);
        if (selection.Interstitials.Count > Math.Max(0, sponsors.Count - 1))
        {
            throw new InvalidOperationException(
                $"{selection.Interstitials.Count} fake commercial/trailer clips cannot be separated by " +
                $"only {sponsors.Count} sponsors. Move enough house clips to Inactive so every one can sit between sponsors.");
        }

        var content = InterleaveHouseContent(sponsors, selection.Interstitials, random);
        if (content.Count < ContentBlockCount)
        {
            throw new InvalidOperationException(
                $"At least {ContentBlockCount} active content clips are required to place three bumpers without stacking them.");
        }

        var boundaries = SelectBumperBoundaries(content, random);
        var bumpers = selection.Bumpers.ToList();
        Shuffle(bumpers, random);

        var playlist = new List<CommercialPlaylistItem>
        {
            ToPlaylistItem(fixedClips.Start, contentBlock: null, logoAssetId: null),
        };
        var blockDurations = new List<TimeSpan>(ContentBlockCount);
        var usedVisualAssets = new Dictionary<string, CommercialVisualAsset>(StringComparer.Ordinal)
        {
            [visuals.Background.Id] = visuals.Background,
            [visuals.TvOverlay.Id] = visuals.TvOverlay,
        };
        var currentBlock = 1;
        var contentStart = 0;
        var bcnLogoCount = visuals.Logos.TryGetValue(CommercialLogoBrand.Bcn, out var bcnLogos)
            ? bcnLogos.Count
            : 0;
        var currentBcnLogoIndex = NormalizeIndex(bcnLogoIndex, bcnLogoCount);
        var brandIndexes = new Dictionary<CommercialLogoBrand, int>();

        for (var contentIndex = 0; contentIndex < content.Count; contentIndex += 1)
        {
            var clip = content[contentIndex];
            string? logoAssetId = null;
            if (clip.LogoBrand is { } brand)
            {
                var logos = GetLogos(visuals, brand);
                var logoIndex = brand == CommercialLogoBrand.Bcn
                    ? currentBcnLogoIndex++
                    : brandIndexes.TryGetValue(brand, out var previous) ? previous : 0;
                var logo = logos[NormalizeIndex(logoIndex, logos.Count)];
                logoAssetId = logo.Id;
                usedVisualAssets[logo.Id] = logo;
                if (brand != CommercialLogoBrand.Bcn) brandIndexes[brand] = logoIndex + 1;
            }

            playlist.Add(ToPlaylistItem(clip, currentBlock, logoAssetId));
            if (!boundaries.Contains(contentIndex + 1)) continue;

            blockDurations.Add(SumClipDurations(content.Skip(contentStart).Take(contentIndex + 1 - contentStart)));
            playlist.Add(ToPlaylistItem(bumpers[currentBlock - 1], contentBlock: null, logoAssetId: null));
            contentStart = contentIndex + 1;
            currentBlock += 1;
        }

        blockDurations.Add(SumClipDurations(content.Skip(contentStart)));
        playlist.Add(ToPlaylistItem(fixedClips.End, contentBlock: null, logoAssetId: null));

        return new CommercialBreakPlan(
            playlist,
            blockDurations,
            bumpers.Select(bumper => bumper.Name).ToArray(),
            selection.OmittedInterstitials.Select(clip => clip.Name).ToArray(),
            usedVisualAssets.Values.ToArray(),
            visuals.Background,
            visuals.TvOverlay,
            sponsors.Count,
            selection.Interstitials.Count,
            SumClipDurations(sponsors),
            SumPlaylistDurations(playlist),
            TargetDuration,
            NormalizeIndex(currentBcnLogoIndex, bcnLogoCount));
    }

    private static BreakSelection SelectClosestToTarget(
        CommercialFixedClips fixedClips,
        IReadOnlyList<CommercialClip> sponsors,
        IReadOnlyList<CommercialClip> interstitials,
        Random random)
    {
        var optional = interstitials
            .Where(clip => clip.OptionalCutPriority.HasValue)
            .OrderBy(clip => clip.OptionalCutPriority)
            .ToArray();
        var required = interstitials
            .Where(clip => !clip.OptionalCutPriority.HasValue)
            .ToArray();
        var candidates = new List<BreakSelection>();
        var fixedDuration = fixedClips.Start.Duration
            + fixedClips.End.Duration
            + SumClipDurations(sponsors)
            + SumClipDurations(required);

        foreach (var bumperSet in Choose(fixedClips.Bumpers, BumperCount))
        {
            for (var mask = 0; mask < (1 << optional.Length); mask += 1)
            {
                var included = optional
                    .Where((_, index) => (mask & (1 << index)) != 0)
                    .ToArray();
                var selectedInterstitials = required.Concat(included).ToArray();
                if (selectedInterstitials.Length > Math.Max(0, sponsors.Count - 1)) continue;

                var omitted = optional.Except(included).ToArray();
                var duration = fixedDuration
                    + SumClipDurations(bumperSet)
                    + SumClipDurations(included);
                candidates.Add(new BreakSelection(
                    bumperSet,
                    selectedInterstitials,
                    omitted,
                    duration,
                    Math.Abs(duration.Ticks - TargetDuration.Ticks),
                    omitted.Length,
                    omitted.Sum(clip => clip.OptionalCutPriority ?? 100),
                    duration > TargetDuration,
                    random.Next()));
            }
        }

        var selected = candidates
            .OrderBy(candidate => candidate.TargetDifferenceTicks)
            .ThenBy(candidate => candidate.OverTarget)
            .ThenBy(candidate => candidate.CutCount)
            .ThenBy(candidate => candidate.CutPriorityScore)
            .ThenBy(candidate => candidate.RandomTieBreaker)
            .FirstOrDefault();
        if (selected is null)
        {
            throw new InvalidOperationException(
                $"The active house clips cannot be separated by {sponsors.Count} sponsors, even after the approved optional cuts.");
        }
        return selected;
    }

    private static IReadOnlyList<CommercialClip> InterleaveHouseContent(
        IReadOnlyList<CommercialClip> sponsors,
        IReadOnlyList<CommercialClip> interstitials,
        Random random)
    {
        var sponsorOrder = sponsors.ToList();
        var interstitialOrder = interstitials.ToList();
        Shuffle(sponsorOrder, random);
        Shuffle(interstitialOrder, random);

        var selectedGaps = Enumerable.Range(0, Math.Max(0, sponsorOrder.Count - 1)).ToList();
        Shuffle(selectedGaps, random);
        selectedGaps = selectedGaps.Take(interstitialOrder.Count).OrderBy(index => index).ToList();
        var interstitialByGap = selectedGaps
            .Select((gap, index) => (gap, clip: interstitialOrder[index]))
            .ToDictionary(item => item.gap, item => item.clip);

        var content = new List<CommercialClip>(sponsors.Count + interstitials.Count);
        for (var sponsorIndex = 0; sponsorIndex < sponsorOrder.Count; sponsorIndex += 1)
        {
            content.Add(sponsorOrder[sponsorIndex]);
            if (interstitialByGap.TryGetValue(sponsorIndex, out var interstitial)) content.Add(interstitial);
        }
        return content;
    }

    private static HashSet<int> SelectBumperBoundaries(
        IReadOnlyList<CommercialClip> content,
        Random random)
    {
        var cumulativeTicks = new long[content.Count + 1];
        for (var index = 0; index < content.Count; index += 1)
        {
            cumulativeTicks[index + 1] = cumulativeTicks[index] + content[index].Duration.Ticks;
        }

        var boundaries = new HashSet<int>();
        var previous = 0;
        for (var bumperIndex = 0; bumperIndex < BumperCount; bumperIndex += 1)
        {
            var range = BumperPlacementRanges[bumperIndex];
            var fraction = range.Minimum + random.NextDouble() * (range.Maximum - range.Minimum);
            var targetTicks = cumulativeTicks[^1] * fraction;
            var minimum = previous + 1;
            var maximum = content.Count - (BumperCount - bumperIndex);
            var selected = Enumerable.Range(minimum, maximum - minimum + 1)
                .OrderBy(position => Math.Abs(cumulativeTicks[position] - targetTicks))
                .ThenBy(_ => random.Next())
                .First();
            boundaries.Add(selected);
            previous = selected;
        }
        return boundaries;
    }

    private static IReadOnlyList<IReadOnlyList<CommercialClip>> Choose(
        IReadOnlyList<CommercialClip> clips,
        int count)
    {
        var results = new List<IReadOnlyList<CommercialClip>>();
        var buffer = new CommercialClip[count];
        void Select(int sourceIndex, int resultIndex)
        {
            if (resultIndex == count)
            {
                results.Add(buffer.ToArray());
                return;
            }
            for (var index = sourceIndex; index <= clips.Count - (count - resultIndex); index += 1)
            {
                buffer[resultIndex] = clips[index];
                Select(index + 1, resultIndex + 1);
            }
        }
        Select(0, 0);
        return results;
    }

    private static IReadOnlyList<CommercialVisualAsset> GetLogos(
        CommercialVisualAssets visuals,
        CommercialLogoBrand brand)
    {
        if (!visuals.Logos.TryGetValue(brand, out var logos) || logos.Count == 0)
        {
            throw new InvalidOperationException($"No {brand.ToString().ToUpperInvariant()} logo is available for tagged house content.");
        }
        return logos;
    }

    private static int NormalizeIndex(int value, int count) => count <= 0 ? 0 : ((value % count) + count) % count;

    private static CommercialPlaylistItem ToPlaylistItem(
        CommercialClip clip,
        int? contentBlock,
        string? logoAssetId) => new(
            clip.Id,
            clip.Name,
            clip.FilePath,
            clip.Duration,
            clip.Kind,
            contentBlock,
            logoAssetId);

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

    private sealed record BreakSelection(
        IReadOnlyList<CommercialClip> Bumpers,
        IReadOnlyList<CommercialClip> Interstitials,
        IReadOnlyList<CommercialClip> OmittedInterstitials,
        TimeSpan Duration,
        long TargetDifferenceTicks,
        int CutCount,
        int CutPriorityScore,
        bool OverTarget,
        int RandomTieBreaker);
}
