using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Barcode.AudioBridge;

internal enum CommercialBreakPlaybackStatus
{
    Idle,
    Queued,
    Playing,
    Completed,
    Failed,
}

internal sealed record CommercialBreakStartResult(
    bool Started,
    string Message,
    int SponsorCount,
    int InterstitialCount,
    TimeSpan TotalDuration,
    IReadOnlyList<TimeSpan> ContentBlockDurations,
    IReadOnlyList<string> OmittedInterstitials,
    IReadOnlyList<string> Warnings);

internal sealed record CommercialPlaybackItemSnapshot(
    string Id,
    string Name,
    string Kind,
    double DurationSeconds,
    int? ContentBlock,
    string Url,
    string? LogoUrl,
    string? LogoBrand,
    string? CornerLogoUrl,
    int? CornerLogoVariant);

internal sealed record CommercialBreakSnapshot(
    string Schema,
    long Generation,
    string Status,
    int CurrentIndex,
    int SponsorCount,
    int InterstitialCount,
    double SponsorDurationSeconds,
    double TotalDurationSeconds,
    double TargetDurationSeconds,
    IReadOnlyList<double> ContentBlockDurationsSeconds,
    string? BackgroundUrl,
    string? TvOverlayUrl,
    IReadOnlyList<CommercialPlaybackItemSnapshot> Items,
    IReadOnlyList<string> Warnings,
    string Message);

internal sealed record CommercialMediaResource(string FilePath, string ContentType);

internal sealed class CommercialMediaSnapshot : IDisposable
{
    private readonly string _directory;
    private bool _disposed;

    private CommercialMediaSnapshot(
        string directory,
        IReadOnlyDictionary<string, CommercialMediaResource> mediaById)
    {
        _directory = directory;
        MediaById = mediaById;
    }

    public IReadOnlyDictionary<string, CommercialMediaResource> MediaById { get; }

    public static CommercialMediaSnapshot Create(CommercialBreakPlan plan, string snapshotsRoot)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentException.ThrowIfNullOrWhiteSpace(snapshotsRoot);
        Directory.CreateDirectory(snapshotsRoot);
        foreach (var staleDirectory in Directory.EnumerateDirectories(snapshotsRoot))
        {
            DeleteDirectory(staleDirectory);
        }

        var runDirectory = Path.Combine(snapshotsRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(runDirectory);
        try
        {
            var sources = plan.Items
                .Select(item => (Id: item.Id, FilePath: item.FilePath, ContentType: "video/mp4"))
                .Concat(plan.UsedVisualAssets.Select(asset =>
                    (Id: asset.Id, FilePath: asset.FilePath, ContentType: asset.ContentType)))
                .DistinctBy(source => source.Id)
                .ToArray();
            var media = new Dictionary<string, CommercialMediaResource>(StringComparer.Ordinal);
            foreach (var source in sources)
            {
                var extension = Path.GetExtension(source.FilePath);
                var destination = Path.Combine(runDirectory, source.Id + extension);
                if (!TryCreateHardLink(destination, source.FilePath))
                {
                    File.Copy(source.FilePath, destination, overwrite: false);
                }
                media[source.Id] = new CommercialMediaResource(destination, source.ContentType);
            }
            return new CommercialMediaSnapshot(runDirectory, media);
        }
        catch
        {
            DeleteDirectory(runDirectory);
            throw;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        DeleteDirectory(_directory);
    }

    private static bool TryCreateHardLink(string destination, string source)
    {
        if (!OperatingSystem.IsWindows()) return false;
        try
        {
            return CreateHardLink(destination, source, IntPtr.Zero);
        }
        catch (DllNotFoundException)
        {
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            return false;
        }
    }

    private static void DeleteDirectory(string directory)
    {
        try
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
        catch (IOException)
        {
            // A browser range request may still be releasing its last handle.
        }
        catch (UnauthorizedAccessException)
        {
            // Best-effort cleanup; stale runs are retried before the next break.
        }
    }

    [DllImport("Kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLink(
        string fileName,
        string existingFileName,
        IntPtr securityAttributes);
}

internal sealed class CommercialBreakService
{
    public const string SchemaVersion = "barcode_commercial_break_v6";

    private readonly object _sync = new();
    private readonly CommercialBreakLibrary _library;
    private CommercialBreakPlan? _plan;
    private CommercialMediaSnapshot? _mediaSnapshot;
    private CommercialBreakPlaybackStatus _status = CommercialBreakPlaybackStatus.Idle;
    private Dictionary<string, CommercialMediaResource> _mediaById = new(StringComparer.Ordinal);
    private IReadOnlyList<string> _warnings = Array.Empty<string>();
    private long _generation;
    private int _currentIndex = -1;
    private int _nextBcnLogoIndex;
    private int _nextCornerLogoIndex;
    private string _message = "Ready";
    private bool _building;
    private DateTimeOffset _lastPlayerHeartbeat = DateTimeOffset.MinValue;

    public CommercialBreakService(CommercialBreakLibrary library)
    {
        ArgumentNullException.ThrowIfNull(library);
        _library = library;
        _library.EnsureLayout();
    }

    public bool CanStart
    {
        get
        {
            lock (_sync)
            {
                return !_building && _status is not CommercialBreakPlaybackStatus.Queued
                    and not CommercialBreakPlaybackStatus.Playing;
            }
        }
    }

    public bool CanStop
    {
        get
        {
            lock (_sync)
            {
                return _status is CommercialBreakPlaybackStatus.Queued or CommercialBreakPlaybackStatus.Playing;
            }
        }
    }

    public string StatusText
    {
        get
        {
            lock (_sync)
            {
                return _status switch
                {
                    CommercialBreakPlaybackStatus.Idle => "Commercials: ready",
                    CommercialBreakPlaybackStatus.Queued when DateTimeOffset.UtcNow - _lastPlayerHeartbeat > TimeSpan.FromSeconds(3)
                        => "Commercials: queued — player source not connected",
                    CommercialBreakPlaybackStatus.Queued => "Commercials: queued",
                    CommercialBreakPlaybackStatus.Playing => $"Commercials: playing {_currentIndex + 1}/{_plan?.Items.Count ?? 0}",
                    CommercialBreakPlaybackStatus.Completed => "Commercials: last break completed",
                    CommercialBreakPlaybackStatus.Failed => "Commercials: last start/playback failed",
                    _ => "Commercials: ready",
                };
            }
        }
    }

    public CommercialBreakStartResult Start()
    {
        int bcnLogoIndex;
        int cornerLogoIndex;
        CommercialMediaSnapshot? pendingMediaSnapshot = null;
        lock (_sync)
        {
            if (_building || _status is CommercialBreakPlaybackStatus.Queued or CommercialBreakPlaybackStatus.Playing)
            {
                return StartResult(false, "A commercial break is already queued or playing.");
            }
            _building = true;
            bcnLogoIndex = _nextBcnLogoIndex;
            cornerLogoIndex = _nextCornerLogoIndex;
        }

        try
        {
            var libraryResult = _library.Load();
            if (!libraryResult.Success || libraryResult.FixedClips is null || libraryResult.Visuals is null)
            {
                SetFailedStart(libraryResult.Message, libraryResult.Warnings);
                BridgeLog.Write($"Commercial break was not started. {libraryResult.Message}");
                return new CommercialBreakStartResult(
                    false,
                    libraryResult.Message,
                    0,
                    0,
                    TimeSpan.Zero,
                    Array.Empty<TimeSpan>(),
                    Array.Empty<string>(),
                    libraryResult.Warnings);
            }

            var random = new Random(RandomNumberGenerator.GetInt32(1, int.MaxValue));
            var plan = CommercialBreakPlaylistBuilder.Build(
                libraryResult.FixedClips,
                libraryResult.Sponsors,
                libraryResult.Interstitials,
                libraryResult.Visuals,
                random,
                bcnLogoIndex,
                cornerLogoIndex);
            var planningWarnings = libraryResult.Warnings
                .Concat(plan.OmittedInterstitials.Select(name =>
                    $"{name} was omitted to keep the complete break closest to 11:00."))
                .ToArray();
            pendingMediaSnapshot = CommercialMediaSnapshot.Create(plan, _library.PlaybackSnapshotsDirectory);

            long generation;
            string message;
            lock (_sync)
            {
                _generation += 1;
                generation = _generation;
                _plan = plan;
                DisposeMediaSnapshotLocked();
                _mediaSnapshot = pendingMediaSnapshot;
                _mediaById = pendingMediaSnapshot.MediaById.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value,
                    StringComparer.Ordinal);
                pendingMediaSnapshot = null;
                _warnings = planningWarnings;
                _nextBcnLogoIndex = plan.NextBcnLogoIndex;
                _nextCornerLogoIndex = plan.NextCornerLogoIndex;
                _status = CommercialBreakPlaybackStatus.Queued;
                _currentIndex = 0;
                _message = $"Queued {plan.SponsorCount} sponsor{(plan.SponsorCount == 1 ? string.Empty : "s")}, " +
                    $"{plan.InterstitialCount} fake commercial/trailer clip{(plan.InterstitialCount == 1 ? string.Empty : "s")}, " +
                    $"total {FormatDuration(plan.TotalDuration)}.";
                message = _message;
            }

            BridgeLog.Write(
                $"Commercial break queued generation={generation} sponsors={plan.SponsorCount} " +
                $"interstitials={plan.InterstitialCount} " +
                $"total_seconds={plan.TotalDuration.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture)} " +
                $"target_seconds={plan.TargetDuration.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture)} " +
                $"blocks={string.Join(",", plan.ContentBlockDurations.Select(duration => duration.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture)))} " +
                $"bumpers={string.Join("|", plan.SelectedBumpers)} " +
                $"omitted={string.Join("|", plan.OmittedInterstitials)}.");
            return new CommercialBreakStartResult(
                true,
                message,
                plan.SponsorCount,
                plan.InterstitialCount,
                plan.TotalDuration,
                plan.ContentBlockDurations,
                plan.OmittedInterstitials,
                planningWarnings);
        }
        catch (Exception error)
        {
            var message = $"Commercial break could not be built. {error.Message}";
            SetFailedStart(message, Array.Empty<string>());
            BridgeLog.Write("Commercial break planning failed.", error);
            return new CommercialBreakStartResult(
                false,
                message,
                0,
                0,
                TimeSpan.Zero,
                Array.Empty<TimeSpan>(),
                Array.Empty<string>(),
                Array.Empty<string>());
        }
        finally
        {
            pendingMediaSnapshot?.Dispose();
            lock (_sync)
            {
                _building = false;
            }
        }
    }

    public CommercialBreakSnapshot Snapshot(bool playerHeartbeat = false)
    {
        lock (_sync)
        {
            if (playerHeartbeat) _lastPlayerHeartbeat = DateTimeOffset.UtcNow;
            var plan = _plan;
            var items = plan?.Items.Select(item => new CommercialPlaybackItemSnapshot(
                item.Id,
                item.Name,
                item.Kind.ToString().ToLowerInvariant(),
                item.Duration.TotalSeconds,
                item.ContentBlock,
                MediaUrl(item.Id),
                item.LogoAssetId is null ? null : MediaUrl(item.LogoAssetId),
                item.LogoBrand?.ToString().ToLowerInvariant(),
                item.CornerLogoAssetId is null ? null : MediaUrl(item.CornerLogoAssetId),
                item.CornerLogoVariant))
                .ToArray() ?? Array.Empty<CommercialPlaybackItemSnapshot>();

            return new CommercialBreakSnapshot(
                SchemaVersion,
                _generation,
                _status.ToString().ToLowerInvariant(),
                _currentIndex,
                plan?.SponsorCount ?? 0,
                plan?.InterstitialCount ?? 0,
                plan?.SponsorDuration.TotalSeconds ?? 0,
                plan?.TotalDuration.TotalSeconds ?? 0,
                plan?.TargetDuration.TotalSeconds ?? CommercialBreakPlaylistBuilder.TargetDuration.TotalSeconds,
                plan?.ContentBlockDurations.Select(duration => duration.TotalSeconds).ToArray() ?? Array.Empty<double>(),
                plan is null ? null : MediaUrl(plan.Background.Id),
                plan is null ? null : MediaUrl(plan.TvOverlay.Id),
                items,
                _warnings,
                _message);
        }
    }

    public bool MarkClipStarted(long generation, int index)
    {
        lock (_sync)
        {
            if (generation != _generation || _plan is null || index < 0 || index >= _plan.Items.Count) return false;
            if (_status is not CommercialBreakPlaybackStatus.Queued and not CommercialBreakPlaybackStatus.Playing) return false;
            if (_status == CommercialBreakPlaybackStatus.Playing && index < _currentIndex) return false;
            _status = CommercialBreakPlaybackStatus.Playing;
            _currentIndex = index;
            _message = $"Playing {_plan.Items[index].Name}.";
            return true;
        }
    }

    public bool MarkCompleted(long generation)
    {
        lock (_sync)
        {
            if (generation != _generation || _plan is null) return false;
            if (_status is not CommercialBreakPlaybackStatus.Queued and not CommercialBreakPlaybackStatus.Playing) return false;
            _status = CommercialBreakPlaybackStatus.Completed;
            _currentIndex = _plan.Items.Count - 1;
            _message = "Commercial break completed.";
            DisposeMediaSnapshotLocked();
            BridgeLog.Write($"Commercial break completed generation={generation}.");
            return true;
        }
    }

    public bool MarkFailed(long generation, string? reason)
    {
        lock (_sync)
        {
            if (generation != _generation || _plan is null) return false;
            if (_status is not CommercialBreakPlaybackStatus.Queued and not CommercialBreakPlaybackStatus.Playing) return false;
            _status = CommercialBreakPlaybackStatus.Failed;
            _message = string.IsNullOrWhiteSpace(reason)
                ? "Commercial player reported a playback error."
                : $"Commercial player error: {reason.Trim()}";
            DisposeMediaSnapshotLocked();
            BridgeLog.Write($"Commercial break failed generation={generation}. {_message}");
            return true;
        }
    }

    public void Stop()
    {
        lock (_sync)
        {
            if (_status is not CommercialBreakPlaybackStatus.Queued and not CommercialBreakPlaybackStatus.Playing) return;
            _status = CommercialBreakPlaybackStatus.Idle;
            _currentIndex = -1;
            _message = "Commercial break stopped.";
            DisposeMediaSnapshotLocked();
            BridgeLog.Write($"Commercial break stopped generation={_generation}.");
        }
    }

    public bool TryGetMedia(string id, out CommercialMediaResource resource)
    {
        lock (_sync)
        {
            if (_mediaById.TryGetValue(id, out var candidate) && File.Exists(candidate.FilePath))
            {
                resource = candidate;
                return true;
            }
        }

        resource = new CommercialMediaResource(string.Empty, "application/octet-stream");
        return false;
    }

    private CommercialBreakStartResult StartResult(bool started, string message)
    {
        var plan = _plan;
        return new CommercialBreakStartResult(
            started,
            message,
            plan?.SponsorCount ?? 0,
            plan?.InterstitialCount ?? 0,
            plan?.TotalDuration ?? TimeSpan.Zero,
            plan?.ContentBlockDurations ?? Array.Empty<TimeSpan>(),
            plan?.OmittedInterstitials ?? Array.Empty<string>(),
            _warnings);
    }

    private static string MediaUrl(string id) => $"/v1/commercials/media/{id}";

    private static string FormatDuration(TimeSpan duration) =>
        $"{(int)duration.TotalMinutes}:{duration.Seconds:00}";

    private void SetFailedStart(string message, IReadOnlyList<string> warnings)
    {
        lock (_sync)
        {
            DisposeMediaSnapshotLocked();
            _plan = null;
            _warnings = warnings.ToArray();
            _status = CommercialBreakPlaybackStatus.Failed;
            _currentIndex = -1;
            _message = message;
        }
    }

    private void DisposeMediaSnapshotLocked()
    {
        _mediaSnapshot?.Dispose();
        _mediaSnapshot = null;
        _mediaById = new Dictionary<string, CommercialMediaResource>(StringComparer.Ordinal);
    }
}
