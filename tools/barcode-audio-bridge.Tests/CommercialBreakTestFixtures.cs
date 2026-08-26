namespace Barcode.AudioBridge.Tests;

internal sealed class TemporaryCommercialLibrary : IDisposable
{
    private static readonly string[] FixedNames =
    {
        "intro.mp4",
        "breaker-1.mp4",
        "breaker-2.mp4",
        "breaker-3.mp4",
        "end.mp4",
    };

    public TemporaryCommercialLibrary(bool createFixed = true)
    {
        RootDirectory = Path.Combine(Path.GetTempPath(), "barcode-commercial-tests", Guid.NewGuid().ToString("N"));
        FixedDirectory = Path.Combine(RootDirectory, "Fixed");
        ActiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Active");
        InactiveDirectory = Path.Combine(RootDirectory, "Sponsors", "Inactive");
        Directory.CreateDirectory(FixedDirectory);
        Directory.CreateDirectory(ActiveDirectory);
        Directory.CreateDirectory(InactiveDirectory);
        if (createFixed)
        {
            foreach (var name in FixedNames) AddFile(FixedDirectory, name);
        }
    }

    public string RootDirectory { get; }
    public string FixedDirectory { get; }
    public string ActiveDirectory { get; }
    public string InactiveDirectory { get; }

    public string AddActiveSponsor(string name) => AddFile(ActiveDirectory, name);
    public string AddInactiveSponsor(string name) => AddFile(InactiveDirectory, name);

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
