using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
    IReadOnlyList<CommercialClip> Interstitials,
    CommercialVisualAssets? Visuals,
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
    private static readonly Regex ParentheticalPattern = new(@"\((?<tag>[^()]*)\)", RegexOptions.Compiled);
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    };
    private static readonly HashSet<string> VisualVideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4",
        ".webm",
    };
    private static readonly IReadOnlyDictionary<string, int> OptionalCutPriorities =
        new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["SPACE1"] = 0,
            ["Alien"] = 1,
            ["May"] = 2,
        };

    private const string Instructions = """
BARCODE LOCAL COMMERCIAL PLAYER

FIXED VIDEOS
Put these two files directly in Fixed:
  START.mp4
  END.mp4

Keep all five bumper MP4s in Fixed\Bumpers, exactly where they were before.
Their file names do not matter. The player chooses three different bumpers for
each break and places them in separate early, middle, and late timing ranges.

ACTIVE CONTENT
Put every video eligible for the next break in Sponsors\Active.
Move any file to Sponsors\Inactive to remove it from the next break.

Files with parentheses are treated as fake commercials/trailers, not sponsors.
Use these tags anywhere in the file name to show a logo during that clip:
  (BCN) = BARCODE
  (BL)  = BLVCKL!GHT
  (R)   = Rigged Sanchez

SPACE1.mp4, Alien.mp4, and May.mp4 are also treated as house content and are
the only clips the player may omit when that gets the full break closer to 11:00.
Every real active sponsor always plays once. House clips are dotted between
sponsors and never placed back-to-back.

VISUALS
Put one looping 1080 x 1920 background video in Visuals\Background.
Put one matching looping 1080 x 1920 TV overlay video in Visuals\TV Overlay.
MP4 and WEBM are supported. Both videos are muted by the player.

Put ICON.png directly in Visuals. It fades in the upper logo panel during START
and END only. Put the two alternating BARCODE logos in Visuals\Logos\BCN, the
BLVCKL!GHT logo in Visuals\Logos\BL, and the Rigged Sanchez logo in
Visuals\Logos\R. PNG, JPG, JPEG, and WEBP logo images are supported.

The player replaces the TV overlay's screen with every start, sponsor, trailer,
bumper, and end video. Only the current sequence clip supplies audio.

PLAYBACK
Right-click the BARCODE Audio Bridge tray icon and choose Start Commercial Break.
The selected media is frozen into a local playback snapshot at start, so moving
files between Active and Inactive while a break runs affects only the next break.
The Playback Snapshots folder is managed and cleaned automatically.

PLAYER SOURCE
Use this permanent local source in TikTok Studio at 1080 x 1920:
  http://127.0.0.1:43120/commercials

Recommended video format: H.264 video + AAC audio in an .mp4 container.
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
    private string BumpersDirectory => Path.Combine(FixedDirectory, "Bumpers");
    private string ActiveDirectory => Path.Combine(_rootDirectory, "Sponsors", "Active");
    private string InactiveDirectory => Path.Combine(_rootDirectory, "Sponsors", "Inactive");
    private string VisualsDirectory => Path.Combine(_rootDirectory, "Visuals");
    private string BackgroundDirectory => Path.Combine(VisualsDirectory, "Background");
    private string TvOverlayDirectory => Path.Combine(VisualsDirectory, "TV Overlay");
    private string LogosDirectory => Path.Combine(VisualsDirectory, "Logos");
    private string InstructionsPath => Path.Combine(_rootDirectory, "README.txt");
    public string PlaybackSnapshotsDirectory => Path.Combine(_rootDirectory, "Playback Snapshots");

    public void EnsureLayout()
    {
        Directory.CreateDirectory(FixedDirectory);
        Directory.CreateDirectory(BumpersDirectory);
        Directory.CreateDirectory(ActiveDirectory);
        Directory.CreateDirectory(InactiveDirectory);
        Directory.CreateDirectory(BackgroundDirectory);
        Directory.CreateDirectory(TvOverlayDirectory);
        foreach (var folder in new[] { "BCN", "BL", "R" })
        {
            Directory.CreateDirectory(Path.Combine(LogosDirectory, folder));
        }
        if (!File.Exists(InstructionsPath) || File.ReadAllText(InstructionsPath) != Instructions)
        {
            File.WriteAllText(InstructionsPath, Instructions);
        }
    }

    public CommercialBreakLibraryResult Load()
    {
        EnsureLayout();
        var warnings = new List<string>();
        var startPath = FindNamedFile(FixedDirectory, "START.mp4");
        var endPath = FindNamedFile(FixedDirectory, "END.mp4");
        var missing = new[]
        {
            (Name: "START.mp4", Path: startPath),
            (Name: "END.mp4", Path: endPath),
        }.Where(file => file.Path is null).Select(file => file.Name).ToArray();
        if (missing.Length > 0)
        {
            return Failure($"Missing fixed commercial files: {string.Join(", ", missing)}", warnings);
        }

        var start = TryCreateClip(startPath!, CommercialClipKind.Start);
        if (start.Clip is null) return Failure($"Fixed commercial file could not be read: START.mp4. {start.Error}", warnings);
        var end = TryCreateClip(endPath!, CommercialClipKind.End);
        if (end.Clip is null) return Failure($"Fixed commercial file could not be read: END.mp4. {end.Error}", warnings);

        var bumperPaths = EnumerateMp4(BumpersDirectory).ToArray();
        if (bumperPaths.Length < CommercialBreakPlaylistBuilder.BumperCount)
        {
            return Failure(
                $"At least {CommercialBreakPlaylistBuilder.BumperCount} MP4 bumpers are required in Fixed\\Bumpers; found {bumperPaths.Length}.",
                warnings);
        }
        var bumpers = new List<CommercialClip>();
        foreach (var path in bumperPaths)
        {
            var result = TryCreateClip(path, CommercialClipKind.Bumper);
            if (result.Clip is null)
            {
                warnings.Add($"{Path.GetFileName(path)} bumper was skipped: {result.Error}");
                continue;
            }
            bumpers.Add(result.Clip);
        }
        if (bumpers.Count < CommercialBreakPlaylistBuilder.BumperCount)
        {
            return Failure(
                $"At least {CommercialBreakPlaylistBuilder.BumperCount} readable bumpers are required in Fixed\\Bumpers; found {bumpers.Count}.",
                warnings);
        }
        if (bumpers.Count != 5)
        {
            warnings.Add($"Expected five available bumpers in Fixed\\Bumpers but found {bumpers.Count}; three will still be selected.");
        }

        var sponsors = new List<CommercialClip>();
        var interstitials = new List<CommercialClip>();
        foreach (var path in EnumerateMp4(ActiveDirectory))
        {
            var name = Path.GetFileNameWithoutExtension(path);
            var cutPriority = GetOptionalCutPriority(name);
            var isInterstitial = ParentheticalPattern.IsMatch(name) || cutPriority.HasValue;
            var result = TryCreateClip(
                path,
                isInterstitial ? CommercialClipKind.Interstitial : CommercialClipKind.Sponsor,
                isInterstitial ? GetLogoBrand(name) : null,
                cutPriority);
            if (result.Clip is null)
            {
                warnings.Add($"{Path.GetFileName(path)} was skipped: {result.Error}");
                continue;
            }
            (isInterstitial ? interstitials : sponsors).Add(result.Clip);
        }

        if (sponsors.Count == 0)
        {
            return Failure("No readable real sponsor MP4 files are in Sponsors\\Active.", warnings);
        }

        var backgroundFiles = EnumerateVisualVideos(BackgroundDirectory).ToArray();
        if (backgroundFiles.Length == 0)
        {
            return Failure("No MP4 or WEBM background video is in Visuals\\Background.", warnings);
        }
        if (backgroundFiles.Length > 1)
        {
            warnings.Add($"Multiple background videos found; using {Path.GetFileName(backgroundFiles[0])}.");
        }

        var tvOverlayFiles = EnumerateVisualVideos(TvOverlayDirectory).ToArray();
        if (tvOverlayFiles.Length == 0)
        {
            return Failure("No MP4 or WEBM TV overlay video is in Visuals\\TV Overlay.", warnings);
        }
        if (tvOverlayFiles.Length > 1)
        {
            warnings.Add($"Multiple TV overlay videos found; using {Path.GetFileName(tvOverlayFiles[0])}.");
        }

        var iconPath = FindNamedFile(VisualsDirectory, "ICON.png");
        if (iconPath is null) return Failure("Missing required visual: Visuals\\ICON.png.", warnings);

        var logos = Enum.GetValues<CommercialLogoBrand>().ToDictionary(
            brand => brand,
            brand => (IReadOnlyList<CommercialVisualAsset>)EnumerateImages(Path.Combine(LogosDirectory, LogoFolder(brand)))
                .Select(CreateVisualAsset)
                .ToArray());
        foreach (var brand in interstitials.Where(clip => clip.LogoBrand.HasValue).Select(clip => clip.LogoBrand!.Value).Distinct())
        {
            var required = brand == CommercialLogoBrand.Bcn ? 2 : 1;
            if (logos[brand].Count >= required) continue;
            return Failure(
                $"{required} {LogoFolder(brand)} logo image{(required == 1 ? string.Empty : "s")} " +
                $"required in Visuals\\Logos\\{LogoFolder(brand)} for active ({LogoFolder(brand)}) clips.",
                warnings);
        }

        return new CommercialBreakLibraryResult(
            true,
            $"Loaded {sponsors.Count} sponsor{(sponsors.Count == 1 ? string.Empty : "s")} and " +
            $"{interstitials.Count} fake commercial/trailer clip{(interstitials.Count == 1 ? string.Empty : "s")}.",
            new CommercialFixedClips(start.Clip!, bumpers, end.Clip!),
            sponsors,
            interstitials,
            new CommercialVisualAssets(
                CreateVisualAsset(backgroundFiles[0]),
                CreateVisualAsset(tvOverlayFiles[0]),
                CreateVisualAsset(iconPath),
                logos),
            warnings);
    }

    private CommercialBreakLibraryResult Failure(string message, IReadOnlyList<string> warnings) => new(
        false,
        message,
        null,
        Array.Empty<CommercialClip>(),
        Array.Empty<CommercialClip>(),
        null,
        warnings.ToArray());

    private (CommercialClip? Clip, string? Error) TryCreateClip(
        string path,
        CommercialClipKind kind,
        CommercialLogoBrand? logoBrand = null,
        int? optionalCutPriority = null)
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
                kind,
                logoBrand,
                optionalCutPriority), null);
        }
        catch (Exception error)
        {
            return (null, error.Message);
        }
    }

    private static CommercialVisualAsset CreateVisualAsset(string path) => new(
        BuildMediaId(path),
        Path.GetFileNameWithoutExtension(path),
        Path.GetFullPath(path),
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            _ => "application/octet-stream",
        });

    private static CommercialLogoBrand? GetLogoBrand(string fileName)
    {
        foreach (Match match in ParentheticalPattern.Matches(fileName))
        {
            var tag = match.Groups["tag"].Value.Trim();
            if (tag.Equals("BCN", StringComparison.OrdinalIgnoreCase)) return CommercialLogoBrand.Bcn;
            if (tag.Equals("BL", StringComparison.OrdinalIgnoreCase)) return CommercialLogoBrand.Bl;
            if (tag.Equals("R", StringComparison.OrdinalIgnoreCase)) return CommercialLogoBrand.R;
        }
        return null;
    }

    private static int? GetOptionalCutPriority(string fileName)
    {
        var untagged = ParentheticalPattern.Replace(fileName, string.Empty).Trim(' ', '-', '_');
        return OptionalCutPriorities.TryGetValue(untagged, out var priority) ? priority : null;
    }

    private static string LogoFolder(CommercialLogoBrand brand) => brand switch
    {
        CommercialLogoBrand.Bcn => "BCN",
        CommercialLogoBrand.Bl => "BL",
        CommercialLogoBrand.R => "R",
        _ => throw new ArgumentOutOfRangeException(nameof(brand)),
    };

    private static string? FindNamedFile(string directory, string fileName) => Directory
        .EnumerateFiles(directory)
        .FirstOrDefault(path => Path.GetFileName(path).Equals(fileName, StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<string> EnumerateMp4(string directory) => Directory
        .EnumerateFiles(directory)
        .Where(path => Path.GetExtension(path).Equals(".mp4", StringComparison.OrdinalIgnoreCase))
        .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase);

    private static IEnumerable<string> EnumerateVisualVideos(string directory) => Directory
        .EnumerateFiles(directory)
        .Where(path => VisualVideoExtensions.Contains(Path.GetExtension(path)))
        .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase);

    private static IEnumerable<string> EnumerateImages(string directory) => Directory
        .EnumerateFiles(directory)
        .Where(path => ImageExtensions.Contains(Path.GetExtension(path)))
        .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase);

    private static string BuildMediaId(string path)
    {
        var info = new FileInfo(path);
        var identity = $"{Path.GetFullPath(path).ToUpperInvariant()}|{info.Length}|{info.LastWriteTimeUtc.Ticks}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(identity));
        return Convert.ToHexString(hash).ToLowerInvariant()[..24];
    }
}
