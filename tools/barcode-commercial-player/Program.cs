namespace Barcode.AudioBridge;

internal static class Program
{
    private const string MutexName = @"Local\BARCODE.CommercialPlayer.Singleton";

    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Contains("--disable-autostart", StringComparer.OrdinalIgnoreCase))
            {
                CommercialInstaller.RemoveAutoStart();
                return;
            }

            if (!CommercialInstaller.IsInstalledExecutable)
            {
                CommercialInstaller.InstallAndLaunch();
                return;
            }

            CommercialInstaller.RegisterAutoStart();
            using var singleton = new Mutex(true, MutexName, out var ownsMutex);
            if (!ownsMutex) return;
            using var context = new CommercialApplicationContext();
            Application.Run(context);
        }
        catch (Exception error)
        {
            BridgeLog.Write("BARCODE Commercial Player stopped because of an unrecoverable error.", error);
            MessageBox.Show(
                $"BARCODE Commercial Player could not start. The separate Show Visuals Audio Bridge is unaffected.\n\nDiagnostics: {BridgeLog.FilePath}",
                "BARCODE Commercial Player",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
