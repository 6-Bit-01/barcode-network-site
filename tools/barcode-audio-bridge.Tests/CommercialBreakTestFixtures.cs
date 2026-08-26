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
        BackgroundDirectory = Path.Combine(RootDirectory, "Visuals", "Background");
        BcnLogosDirectory = Path.Combine(RootDirectory, "Visuals", "Logos", "BCN");
        BlLogosDirectory = Path.Combine(RootDirectory, "Visuals", "Logos", "BL");
        RLogosDirectory = Path.Combine(RootDirectory, "Visuals", "Logos", "R");
        foreach (var directory in new[]
        {
            FixedDirectory,
            BumpersDirectory,
            ActiveDirectory,
            InactiveDirectory,
            BackgroundDirectory,
            BcnLogosDirectory,
            BlLogosDirectory,
            RLogosDirectory,
        })
        {
            Directory.CreateDirectory(directory);
        }

        if (!createFixed) return;
        AddFile(FixedDirectory, "start.mp4");
        AddFile(FixedDirectory, "end.mp4");
        foreach (var index in Enumerable.Range(1, 5)) AddBumper($"bumper-{index}.mp4");
        AddFile(BackgroundDirectory, "background.png");
        AddFile(BcnLogosDirectory, "bcn-1.png");
        AddFile(BcnLogosDirectory, "bcn-2.png");
        AddFile(BlLogosDirectory, "bl.png");
        AddFile(RLogosDirectory, "r.png");
    }

    public string RootDirectory { get; }
    public string FixedDirectory { get; }
    public string BumpersDirectory { get; }
    public string ActiveDirectory { get; }
    public string InactiveDirectory { get; }
    public string BackgroundDirectory { get; }
    public string BcnLogosDirectory { get; }
    public string BlLogosDirectory { get; }
    public string RLogosDirectory { get; }

    public string AddActiveSponsor(string name) => AddFile(ActiveDirectory, name);
    public string AddInactiveSponsor(string name) => AddFile(InactiveDirectory, name);
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
