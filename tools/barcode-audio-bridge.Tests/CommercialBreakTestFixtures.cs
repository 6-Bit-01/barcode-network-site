namespace Barcode.AudioBridge.Tests;

internal sealed class TemporaryCommercialLibrary : IDisposable
{
    public TemporaryCommercialLibrary(bool createFixed = true)
    {
        RootDirectory = Path.Combine(Path.GetTempPath(), "barcode-commercial-tests", Guid.NewGuid().ToString("N"));
        FixedDirectory = Path.Combine(RootDirectory, "Fixed");
        BumpersDirectory = Path.Combine(FixedDirectory, "Bumpers");
        ActiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Active");
        InactiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Inactive");
        VisualsDirectory = Path.Combine(RootDirectory, "Visuals");
        BackgroundDirectory = Path.Combine(VisualsDirectory, "Background");
        TvOverlayDirectory = Path.Combine(VisualsDirectory, "TV Overlay");
        CornerLogosDirectory = Path.Combine(VisualsDirectory, "Corner Logos");
        BcnLogosDirectory = Path.Combine(VisualsDirectory, "Logos", "BCN");
        BlLogosDirectory = Path.Combine(VisualsDirectory, "Logos", "BL");
        RLogosDirectory = Path.Combine(VisualsDirectory, "Logos", "R");
        foreach (var directory in new[]
        {
            FixedDirectory,
            BumpersDirectory,
            ActiveDirectory,
            InactiveDirectory,
            BackgroundDirectory,
            TvOverlayDirectory,
            CornerLogosDirectory,
            BcnLogosDirectory,
            BlLogosDirectory,
            RLogosDirectory,
        })
        {
            Directory.CreateDirectory(directory);
        }

        if (!createFixed) return;
        AddFile(FixedDirectory, "START.mp4");
        foreach (var index in Enumerable.Range(1, 5)) AddBumper($"existing-bumper-{index}.mp4");
        AddFile(FixedDirectory, "END.mp4");
        AddFile(BackgroundDirectory, "BG.mp4");
        AddFile(TvOverlayDirectory, "TV.mp4");
        AddFile(CornerLogosDirectory, "CORNERLOGO1.png");
        AddFile(CornerLogosDirectory, "CORNERLOGO2.png");
        AddFile(VisualsDirectory, "ICON.png");
        AddFile(BcnLogosDirectory, "BCN1.png");
        AddFile(BcnLogosDirectory, "BCN2.png");
        AddFile(BlLogosDirectory, "BL.png");
        AddFile(RLogosDirectory, "R.png");
    }

    public string RootDirectory { get; }
    public string FixedDirectory { get; }
    public string BumpersDirectory { get; }
    public string ActiveDirectory { get; }
    public string InactiveDirectory { get; }
    public string VisualsDirectory { get; }
    public string BackgroundDirectory { get; }
    public string TvOverlayDirectory { get; }
    public string CornerLogosDirectory { get; }
    public string BcnLogosDirectory { get; }
    public string BlLogosDirectory { get; }
    public string RLogosDirectory { get; }
    public string BackgroundPath => Path.Combine(BackgroundDirectory, "BG.mp4");
    public string TvPath => Path.Combine(TvOverlayDirectory, "TV.mp4");
    public string IconPath => Path.Combine(VisualsDirectory, "ICON.png");

    public string AddActiveSponsor(string name) => AddFile(ActiveDirectory, name);
    public string AddInactiveSponsor(string name) => AddFile(InactiveDirectory, name);
    public string AddBumper(int index) => AddFile(BumpersDirectory, $"existing-bumper-{index}.mp4");
    public string AddBumper(string name) => AddFile(BumpersDirectory, name);

    public static string AddFile(string directory, string name)
    {
        var path = Path.Combine(directory, name);
        File.WriteAllBytes(path, new byte[] { 0x42, 0x4e, 0x4c });
        return path;
    }

    public void Dispose()
    {
        try { Directory.Delete(RootDirectory, recursive: true); } catch { }
    }
}

internal sealed class TestDurationReader : ICommercialDurationReader
{
    private readonly Dictionary<string, TimeSpan> _durations = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _failures = new(StringComparer.OrdinalIgnoreCase);

    public TestDurationReader With(string fileName, double seconds)
    {
        _durations[fileName] = TimeSpan.FromSeconds(seconds);
        return this;
    }

    public TestDurationReader Fail(string fileName)
    {
        _failures.Add(fileName);
        return this;
    }

    public TimeSpan ReadDuration(string filePath)
    {
        var name = Path.GetFileName(filePath);
        if (_failures.Contains(name)) throw new InvalidDataException("fixture unreadable");
        return _durations.TryGetValue(name, out var duration)
            ? duration
            : TimeSpan.FromSeconds(10);
    }
}
