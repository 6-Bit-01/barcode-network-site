using System.Drawing;

namespace Barcode.AudioBridge;

internal sealed class BridgeApplicationContext : ApplicationContext
{
    private readonly LoopbackCaptureController _capture = new();
    private readonly LocalSignalServer _server;
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly System.Windows.Forms.Timer _statusTimer;
    private bool _shuttingDown;

    public BridgeApplicationContext()
    {
        _server = new LocalSignalServer(_capture);
        _server.Start();

        _statusItem = new ToolStripMenuItem(_capture.Status) { Enabled = false };
        var openLogs = new ToolStripMenuItem("Open diagnostics folder");
        openLogs.Click += (_, _) => BridgeLog.OpenDirectory();
        var exit = new ToolStripMenuItem("Exit until next Windows sign-in");
        exit.Click += (_, _) => ExitThread();
        var disable = new ToolStripMenuItem("Disable autostart and exit");
        disable.Click += (_, _) =>
        {
            BridgeInstaller.RemoveAutoStart();
            ExitThread();
        };

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            _statusItem,
            new ToolStripSeparator(),
            openLogs,
            new ToolStripSeparator(),
            exit,
            disable,
        ]);

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Information,
            Text = "BARCODE Audio Bridge",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _notifyIcon.DoubleClick += (_, _) => MessageBox.Show(
            _capture.Status,
            "BARCODE Audio Bridge",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);

        _statusTimer = new System.Windows.Forms.Timer { Interval = 1_000, Enabled = true };
        _statusTimer.Tick += (_, _) =>
        {
            _statusItem.Text = _capture.Status;
            _notifyIcon.Text = _capture.CaptureActive ? "BARCODE Audio Bridge — LIVE" : "BARCODE Audio Bridge — ready";
        };
        BridgeLog.Write("BARCODE Audio Bridge started.");
    }

    protected override void ExitThreadCore()
    {
        if (_shuttingDown) return;
        _shuttingDown = true;
        _statusTimer.Stop();
        _statusTimer.Dispose();
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _server.Dispose();
        _capture.Dispose();
        BridgeLog.Write("BARCODE Audio Bridge exited.");
        base.ExitThreadCore();
    }
}
