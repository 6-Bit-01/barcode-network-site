namespace Barcode.AudioBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Contains("--disable-autostart", StringComparer.OrdinalIgnoreCase))
            {
                BridgeInstaller.RemoveAutoStart();
                return;
            }

            if (!BridgeInstaller.IsInstalledExecutable)
            {
                BridgeInstaller.InstallAndLaunch();
                return;
            }

            BridgeInstaller.RegisterAutoStart();
            using var singleton = new Mutex(true, BridgeConstants.MutexName, out var ownsMutex);
            if (!ownsMutex) return;
            using var context = new BridgeApplicationContext();
            Application.Run(context);
        }
        catch (Exception error)
        {
            BridgeLog.Write("BARCODE Audio Bridge stopped because of an unrecoverable error.", error);
            MessageBox.Show(
                $"BARCODE Audio Bridge could not start. The visual overlay will continue using its built-in randomized music motion.\n\nDiagnostics: {BridgeLog.FilePath}",
                "BARCODE Audio Bridge",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
