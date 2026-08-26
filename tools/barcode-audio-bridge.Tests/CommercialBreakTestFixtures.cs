namespace Barcode.AudioBridge.Tests;

internal sealed class TemporaryCommercialLibrary : IDisposable
{
    public TemporaryCommercialLibrary(bool createFixed = true)
    {
        RootDirectory = Path.Combine(Path.GetTempPath(), "barcode-commercial-tests", Guid.NewGuid().ToString("N"));
        FixedDirectory = Path.Combine(RootDirectory, "Fixed");
        ActiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Active");
        InactiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Inactive");
        foreach (var directory in new[] { FixedDirectory, ActiveDirectory, InactiveDirectory })
        {
            Directory.CreateDirectory(directory);
        }

        if (!createFixed) return;
        AddFile(FixedDirectory, "START.mp4");
        foreach (var index in Enumerable.Range(1, 5)) AddBumper(index);
        AddFile(FixedDirectory, "END.mp4");
        AddFile(RootDirectory, "BG.mp4");
        AddFile(RootDirectory, "TV.mp4");
        AddFile(RootDirectory, "ICON.png");
        AddFile(RootDirectory, "BCN1.png");
        AddFile(RootDirectory, "BCN2.png");
        AddFile(RootDirectory, "BL.png");
        AddFile(RootDirectory, "R.png");
    }

    public string RootDirectory { get; }
    public string FixedDirectory { get; }
    public string ActiveDirectory { get; }
    public string InactiveDirectory { get; }
    public string BackgroundPath => Path.Combine(RootDirectory, "BG.mp4");
    public string TvPath => Path.Combine(RootDirectory, "TV.mp4");
    public string IconPath => Path.Combine(RootDirectory, "ICON.png");

    public string AddActiveSponsor(string name) => AddFile(ActiveDirectory, name);
    public string AddInactiveSponsor(string name) => AddFile(InactiveDirectory, name);
    public string AddBumper(int index) => AddFile(FixedDirectory, $"BUMPER{index}.mp4");
    public string AddBumper(string name) => AddFile(FixedDirectory, name);

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
