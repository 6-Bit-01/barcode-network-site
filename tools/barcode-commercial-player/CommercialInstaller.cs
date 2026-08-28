using System.Diagnostics;
using Microsoft.Win32;

namespace Barcode.AudioBridge;

internal static class CommercialInstaller
{
    private const string AutoStartValueName = "BARCODE Commercial Player";
    private static string InstallDirectory => BridgeLog.DirectoryPath;
    private static string InstalledExecutable => Path.Combine(InstallDirectory, "BARCODE.CommercialPlayer.exe");

    public static bool IsInstalledExecutable
    {
        get
        {
            var current = Environment.ProcessPath;
            return current is not null && string.Equals(
                Path.GetFullPath(current),
                Path.GetFullPath(InstalledExecutable),
                StringComparison.OrdinalIgnoreCase);
        }
    }

    public static void InstallAndLaunch()
    {
        var current = Environment.ProcessPath ?? throw new InvalidOperationException("The commercial player executable path is unavailable.");
        Directory.CreateDirectory(InstallDirectory);
        StopInstalledInstance();
        var temporary = InstalledExecutable + ".new";
        File.Copy(current, temporary, true);
        File.Move(temporary, InstalledExecutable, true);
        RegisterAutoStart();
        Process.Start(new ProcessStartInfo(InstalledExecutable, "--background") { UseShellExecute = true });
        MessageBox.Show(
            "BARCODE Commercial Player is installed and running. It will start with Windows and host only the separate sponsor/commercial overlay.",
            "BARCODE Commercial Player",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private static void StopInstalledInstance()
    {
        var currentProcessId = Environment.ProcessId;
        foreach (var process in Process.GetProcessesByName("BARCODE.CommercialPlayer"))
        {
            using (process)
            {
                if (process.Id == currentProcessId) continue;
                string? path;
                try { path = process.MainModule?.FileName; }
                catch { continue; }
                if (path is null || !string.Equals(
                    Path.GetFullPath(path),
                    Path.GetFullPath(InstalledExecutable),
                    StringComparison.OrdinalIgnoreCase)) continue;
                process.Kill(entireProcessTree: true);
                process.WaitForExit(2_000);
            }
        }
    }

    public static void RegisterAutoStart()
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        key?.SetValue(AutoStartValueName, $"\"{InstalledExecutable}\" --background");
    }

    public static void RemoveAutoStart()
    {
        using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
        key?.DeleteValue(AutoStartValueName, false);
    }
}
