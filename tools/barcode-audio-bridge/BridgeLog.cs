using System.Diagnostics;
using System.Text;

namespace Barcode.AudioBridge;

internal static class BridgeLog
{
    private static readonly object Sync = new();

    public static string DirectoryPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "BARCODE Network",
        "Audio Bridge");

    public static string FilePath => Path.Combine(DirectoryPath, "audio-bridge.log");

    public static void Write(string message, Exception? error = null)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(DirectoryPath);
                if (File.Exists(FilePath) && new FileInfo(FilePath).Length > 1_000_000)
                {
                    File.Move(FilePath, Path.Combine(DirectoryPath, "audio-bridge.previous.log"), true);
                }

                var line = new StringBuilder()
                    .Append(DateTimeOffset.Now.ToString("O"))
                    .Append("  ")
                    .Append(message);
                if (error is not null)
                {
                    line.Append("  ").Append(error.GetType().Name).Append(": ").Append(error.Message);
                }
                File.AppendAllText(FilePath, line.AppendLine().ToString());
            }
        }
        catch
        {
            // Diagnostics must never interrupt a show.
        }
    }

    public static void OpenDirectory()
    {
        Directory.CreateDirectory(DirectoryPath);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{DirectoryPath}\"") { UseShellExecute = true });
    }
}
