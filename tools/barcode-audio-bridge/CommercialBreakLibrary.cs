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
    private static readonly IReadOnlyDictionary<string, int> OptionalCutPriorities =
        new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["SPACE1"] = 0,
            ["Alien"] = 1,
            ["May"] = 2,
        };

    private const string Instructions = """
BARCODE LOCAL COMMERCIAL PLAYER

EXACT FIXED FILE NAMES
Put these seven MP4 files directly in Fixed:
  START.mp4
  BUMPER1.mp4
  BUMPER2.mp4
  BUMPER3.mp4
  BUMPER4.mp4
  BUMPER5.mp4
  END.mp4

The player chooses three different bumpers for each break and places them in
separate early, middle, and late timing ranges.

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

EXACT ROOT VISUAL FILE NAMES
Put these files beside the Fixed and Sponsors folders:
  BG.mp4
  TV.mp4
  BCN1.png
  BCN2.png
  BL.png
  R.png

BG.mp4 loops behind the composition. TV.mp4 is the animated frame; the player
cuts a transparent opening over its yellow screen and places every start,
sponsor, trailer, bumper, and end video inside that opening. BG.mp4 and TV.mp4
are muted. Only the current sequence clip supplies audio.

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
    private string ActiveDirectory => Path.Combine(_rootDirectory, "Sponsors", "Active");
    private string InactiveDirectory => Path.Combine(_rootDirectory, "Sponsors", "Inactive");
    private string InstructionsPath => Path.Combine(_rootDirectory, "README.txt");
    public string PlaybackSnapshotsDirectory => Path.Combine(_rootDirectory, "Playback Snapshots");

    public void EnsureLayout()
    {
        Directory.CreateDirectory(FixedDirectory);
        Directory.CreateDirectory(ActiveDirectory);
        Directory.CreateDirectory(InactiveDirectory);
        if (!File.Exists(InstructionsPath) || File.ReadAllText(InstructionsPath) != Instructions)
        {
            File.WriteAllText(InstructionsPath, Instructions);
        }
    }

    public CommercialBreakLibraryResult Load()
    {
        EnsureLayout();
        var warnings = new List<string>();
        var fixedNames = new[]
        {
            "START.mp4", "BUMPER1.mp4", "BUMPER2.mp4", "BUMPER3.mp4",
            "BUMPER4.mp4", "BUMPER5.mp4", "END.mp4",
        };
        var fixedPaths = fixedNames.ToDictionary(
            name => name,
            name => FindNamedFile(FixedDirectory, name),
            StringComparer.OrdinalIgnoreCase);
        var missing = fixedPaths.Where(pair => pair.Value is null).Select(pair => pair.Key).ToArray();
        if (missing.Length > 0)
        {
            return Failure($"Missing fixed commercial files: {string.Join(", ", missing)}", warnings);
        }

        var start = CreateRequiredClip(fixedPaths["START.mp4"]!, "START.mp4", CommercialClipKind.Start, warnings);
        if (start is null) return _lastFailure!;
        var end = CreateRequiredClip(fixedPaths["END.mp4"]!, "END.mp4", CommercialClipKind.End, warnings);
        if (end is null) return _lastFailure!;

        var bumpers = new List<CommercialClip>();
        foreach (var name in fixedNames.Skip(1).Take(5))
        {
            var bumper = CreateRequiredClip(fixedPaths[name]!, name, CommercialClipKind.Bumper, warnings);
            if (bumper is null) return _lastFailure!;
            bumpers.Add(bumper);
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

        var bgPath = FindNamedFile(_rootDirectory, "BG.mp4");
        if (bgPath is null) return Failure("Missing required root visual: BG.mp4.", warnings);
        var tvPath = FindNamedFile(_rootDirectory, "TV.mp4");
        if (tvPath is null) return Failure("Missing required root visual: TV.mp4.", warnings);

        var logos = new Dictionary<CommercialLogoBrand, IReadOnlyList<CommercialVisualAsset>>
        {
            [CommercialLogoBrand.Bcn] = LoadLogos("BCN1.png", "BCN2.png"),
            [CommercialLogoBrand.Bl] = LoadLogos("BL.png"),
            [CommercialLogoBrand.R] = LoadLogos("R.png"),
        };
        foreach (var brand in interstitials.Where(clip => clip.LogoBrand.HasValue).Select(clip => clip.LogoBrand!.Value).Distinct())
        {
            var required = brand == CommercialLogoBrand.Bcn ? 2 : 1;
            if (logos[brand].Count >= required) continue;
            var names = brand switch
            {
                CommercialLogoBrand.Bcn => "BCN1.png and BCN2.png",
                CommercialLogoBrand.Bl => "BL.png",
                CommercialLogoBrand.R => "R.png",
                _ => string.Empty,
            };
            return Failure($"Missing required root logo file(s): {names}.", warnings);
        }

        return new CommercialBreakLibraryResult(
            true,
            $"Loaded {sponsors.Count} sponsor{(sponsors.Count == 1 ? string.Empty : "s")} and " +
            $"{interstitials.Count} fake commercial/trailer clip{(interstitials.Count == 1 ? string.Empty : "s")}.",
            new CommercialFixedClips(start, bumpers, end),
            sponsors,
            interstitials,
            new CommercialVisualAssets(CreateVisualAsset(bgPath), CreateVisualAsset(tvPath), logos),
            warnings);
    }

    private CommercialBreakLibraryResult? _lastFailure;

    private CommercialClip? CreateRequiredClip(
        string path,
        string displayName,
        CommercialClipKind kind,
        IReadOnlyList<string> warnings)
    {
        var result = TryCreateClip(path, kind);
        if (result.Clip is not null) return result.Clip;
        _lastFailure = Failure($"Fixed commercial file could not be read: {displayName}. {result.Error}", warnings);
        return null;
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

    private IReadOnlyList<CommercialVisualAsset> LoadLogos(params string[] names) => names
        .Select(name => FindNamedFile(_rootDirectory, name))
        .Where(path => path is not null)
        .Select(path => CreateVisualAsset(path!))
        .ToArray();

    private static CommercialVisualAsset CreateVisualAsset(string path) => new(
        BuildMediaId(path),
        Path.GetFileNameWithoutExtension(path),
        Path.GetFullPath(path),
        Path.GetExtension(path).Equals(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "video/mp4");

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

    private static string? FindNamedFile(string directory, string fileName) => Directory
        .EnumerateFiles(directory)
        .FirstOrDefault(path => Path.GetFileName(path).Equals(fileName, StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<string> EnumerateMp4(string directory) => Directory
        .EnumerateFiles(directory)
        .Where(path => Path.GetExtension(path).Equals(".mp4", StringComparison.OrdinalIgnoreCase))
        .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase);

    private static string BuildMediaId(string path)
    {
        var info = new FileInfo(path);
        var identity = $"{Path.GetFullPath(path).ToUpperInvariant()}|{info.Length}|{info.LastWriteTimeUtc.Ticks}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(identity));
        return Convert.ToHexString(hash).ToLowerInvariant()[..24];
    }
}
