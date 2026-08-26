using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using NAudio.Wave;

namespace Barcode.AudioBridge;

internal interface ICommercialDurationReader
{
    TimeSpan ReadDuration(string filePath);
}

internal sealed class MediaFoundationCommercialDurationReader : ICommercialDurationReader
{
    public TimeSpan ReadDuration(string filePath)
    {
        using var reader = new MediaFoundationReader(filePath);
        return reader.TotalTime;
    }
}

internal sealed record CommercialBreakLibraryResult(
    bool Success,
    string Message,
    CommercialFixedClips? FixedClips,
    IReadOnlyList<CommercialClip> Sponsors,
    IReadOnlyList<string> Warnings);

internal static class CommercialBreakPaths
{
    public static string RootDirectory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "BARCODE Network",
        "Commercials");

    public static string PlayerUrl => $"http://127.0.0.1:{BridgeConstants.Port}/commercials";
    public static string PreviewUrl => PlayerUrl + "?debug=1";

    public static void EnsureCreated() => CommercialBreakLibrary.CreateDefault().EnsureLayout();

    public static void OpenRootDirectory()
    {
        EnsureCreated();
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{RootDirectory}\"") { UseShellExecute = true });
    }

    public static void OpenPreview() =>
        Process.Start(new ProcessStartInfo(PreviewUrl) { UseShellExecute = true });
}

internal sealed class CommercialBreakLibrary
{
    private static readonly string[] RequiredFixedNames =
    {
        "intro.mp4",
        "breaker-1.mp4",
        "breaker-2.mp4",
        "breaker-3.mp4",
        "end.mp4",
    };

    private const string Instructions = """
BARCODE LOCAL COMMERCIAL PLAYER

FIXED FILES
Put these exact MP4 file names in the Fixed folder:
  intro.mp4
  breaker-1.mp4
  breaker-2.mp4
  breaker-3.mp4
  end.mp4

SPONSORS
Drop every currently eligible sponsor MP4 into Sponsors\Active.
Move a sponsor into Sponsors\Inactive to remove it from the next break without deleting it.

PLAYBACK
Right-click the BARCODE Audio Bridge tray icon and choose Start Commercial Break.
The helper scans the folders at that moment, reads each active sponsor's duration,
balances the sponsors into four similarly timed blocks around the three breakers,
randomizes the balanced sequence, and plays intro through end automatically.

PLAYER SOURCE
Use this permanent local source in TikTok Studio:
  http://127.0.0.1:43120/commercials

Recommended format: H.264 video + AAC audio in an .mp4 container.
Folder changes apply to the next break and never rewrite a break already running.
""";

    private readonly string _rootDirectory;
    private readonly ICommercialDurationReader _durationReader;

    public CommercialBreakLibrary(string rootDirectory, ICommercialDurationReader durationReader)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectory);
        ArgumentNullException.ThrowIfNull(durationReader);
        _rootDirectory = Path.GetFullPath(rootDirectory);
        _durationReader = durationReader;
    }

    public static CommercialBreakLibrary CreateDefault() => new(
        CommercialBreakPaths.RootDirectory,
        new MediaFoundationCommercialDurationReader());

    private string FixedDirectory => Path.Combine(_rootDirectory, "Fixed");
    private string ActiveSponsorsDirectory => Path.Combine(_rootDirectory, "Sponsors", "Active");
    private string InactiveSponsorsDirectory => Path.Combine(_rootDirectory, "Sponsors", "Inactive");
    private string InstructionsPath => Path.Combine(_rootDirectory, "README.txt");

    public void EnsureLayout()
    {
        Directory.CreateDirectory(FixedDirectory);
        Directory.CreateDirectory(ActiveSponsorsDirectory);
        Directory.CreateDirectory(InactiveSponsorsDirectory);
        if (!File.Exists(InstructionsPath))
        {
            File.WriteAllText(InstructionsPath, Instructions);
        }
    }

    public CommercialBreakLibraryResult Load()
    {
        EnsureLayout();

        var missing = RequiredFixedNames
            .Where(name => !File.Exists(Path.Combine(FixedDirectory, name)))
            .ToArray();
        if (missing.Length > 0)
        {
            return new CommercialBreakLibraryResult(
                false,
                $"Missing fixed commercial files: {string.Join(", ", missing)}",
                null,
                Array.Empty<CommercialClip>(),
                Array.Empty<string>());
        }

        var fixedClips = new List<CommercialClip>();
        foreach (var name in RequiredFixedNames)
        {
            var path = Path.Combine(FixedDirectory, name);
            var kind = name switch
            {
                "intro.mp4" => CommercialClipKind.Intro,
                "end.mp4" => CommercialClipKind.End,
                _ => CommercialClipKind.Breaker,
            };
            var clipResult = TryCreateClip(path, kind);
            if (clipResult.Clip is null)
            {
                return new CommercialBreakLibraryResult(
                    false,
                    $"Fixed commercial file could not be read: {name}. {clipResult.Error}",
                    null,
                    Array.Empty<CommercialClip>(),
                    Array.Empty<string>());
            }
            fixedClips.Add(clipResult.Clip);
        }

        var sponsors = new List<CommercialClip>();
        var warnings = new List<string>();
        foreach (var path in Directory
            .EnumerateFiles(ActiveSponsorsDirectory)
            .Where(path => string.Equals(Path.GetExtension(path), ".mp4", StringComparison.OrdinalIgnoreCase))
            .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase))
        {
            var clipResult = TryCreateClip(path, CommercialClipKind.Sponsor);
            if (clipResult.Clip is null)
            {
                warnings.Add($"{Path.GetFileName(path)} was skipped: {clipResult.Error}");
                continue;
            }
            sponsors.Add(clipResult.Clip);
        }

        if (sponsors.Count == 0)
        {
            return new CommercialBreakLibraryResult(
                false,
                "No readable MP4 sponsor files are in Sponsors\\Active.",
                null,
                Array.Empty<CommercialClip>(),
                warnings);
        }

        var fixedSet = new CommercialFixedClips(
            fixedClips[0],
            fixedClips.Skip(1).Take(3).ToArray(),
            fixedClips[4]);
        return new CommercialBreakLibraryResult(
            true,
            $"Loaded {sponsors.Count} active sponsor{(sponsors.Count == 1 ? string.Empty : "s")}.",
            fixedSet,
            sponsors,
            warnings);
    }

    private (CommercialClip? Clip, string? Error) TryCreateClip(string path, CommercialClipKind kind)
    {
        try
        {
            var duration = _durationReader.ReadDuration(path);
            if (duration <= TimeSpan.Zero || duration > TimeSpan.FromHours(1))
            {
                return (null, "duration is unavailable or outside the supported range");
            }

            return (new CommercialClip(
                BuildMediaId(path),
                Path.GetFileNameWithoutExtension(path),
                Path.GetFullPath(path),
                duration,
                kind), null);
        }
        catch (Exception error)
        {
            return (null, error.Message);
        }
    }

    private static string BuildMediaId(string path)
    {
        var info = new FileInfo(path);
        var identity = $"{Path.GetFullPath(path).ToUpperInvariant()}|{info.Length}|{info.LastWriteTimeUtc.Ticks}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(identity));
        return Convert.ToHexString(hash).ToLowerInvariant()[..24];
    }
}
