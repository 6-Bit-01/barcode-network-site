using System.Drawing;

namespace Barcode.AudioBridge;

internal sealed class CommercialApplicationContext : ApplicationContext
{
    private readonly CommercialBreakService _commercials;
    private readonly CommercialPlayerServer _server;
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _startItem;
    private readonly ToolStripMenuItem _stopItem;
    private readonly System.Windows.Forms.Timer _statusTimer;
    private bool _shuttingDown;

    public CommercialApplicationContext()
    {
        _commercials = new CommercialBreakService(CommercialBreakLibrary.CreateDefault());
        _server = new CommercialPlayerServer(_commercials);
        _server.Start();

        _statusItem = new ToolStripMenuItem(_commercials.StatusText) { Enabled = false };
        _startItem = new ToolStripMenuItem("Start Commercial Break");
        _startItem.Click += (_, _) => StartCommercialBreak();
        _stopItem = new ToolStripMenuItem("Stop Commercial Break") { Enabled = false };
        _stopItem.Click += (_, _) => _commercials.Stop();

        var openCommercials = new ToolStripMenuItem("Open commercial folder");
        openCommercials.Click += (_, _) => CommercialBreakPaths.OpenRootDirectory();
        var copyPlayerUrl = new ToolStripMenuItem("Copy permanent TikTok Studio source URL");
        copyPlayerUrl.Click += (_, _) => CopyCommercialPlayerUrl();
        var openPreview = new ToolStripMenuItem("Open diagnostic preview (not Studio source)");
        openPreview.Click += (_, _) => CommercialBreakPaths.OpenPreview();
        var openLogs = new ToolStripMenuItem("Open diagnostics folder");
        openLogs.Click += (_, _) => BridgeLog.OpenDirectory();
        var exit = new ToolStripMenuItem("Exit until next Windows sign-in");
        exit.Click += (_, _) => ExitThread();
        var disable = new ToolStripMenuItem("Disable autostart and exit");
        disable.Click += (_, _) =>
        {
            CommercialInstaller.RemoveAutoStart();
            ExitThread();
        };

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            _statusItem,
            new ToolStripSeparator(),
            _startItem,
            _stopItem,
            new ToolStripSeparator(),
            openCommercials,
            copyPlayerUrl,
            openPreview,
            new ToolStripSeparator(),
            openLogs,
            new ToolStripSeparator(),
            exit,
            disable,
        ]);

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Information,
            Text = "BARCODE Commercial Player",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _notifyIcon.DoubleClick += (_, _) => MessageBox.Show(
            $"{_commercials.StatusText}\n\nPermanent TikTok Studio source:\n{CommercialBreakPaths.PlayerUrl}",
            "BARCODE Commercial Player",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);

        _statusTimer = new System.Windows.Forms.Timer { Interval = 1_000, Enabled = true };
        _statusTimer.Tick += (_, _) =>
        {
            _statusItem.Text = _commercials.StatusText;
            _startItem.Enabled = _commercials.CanStart;
            _stopItem.Enabled = _commercials.CanStop;
        };
        BridgeLog.Write("BARCODE Commercial Player started.");
    }

    private void StartCommercialBreak()
    {
        var result = _commercials.Start();
        if (!result.Started)
        {
            MessageBox.Show(
                result.Message,
                "Commercial break not started",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var blockTimes = string.Join(" / ", result.ContentBlockDurations.Select(FormatDuration));
        var warningSuffix = result.Warnings.Count == 0
            ? string.Empty
            : $" · {result.Warnings.Count} note{(result.Warnings.Count == 1 ? string.Empty : "s")}";
        _notifyIcon.ShowBalloonTip(
            4_000,
            "Commercial break queued",
            $"{result.SponsorCount} sponsor{(result.SponsorCount == 1 ? string.Empty : "s")} + " +
            $"{result.InterstitialCount} house · {FormatDuration(result.TotalDuration)} total · blocks {blockTimes}{warningSuffix}",
            result.Warnings.Count == 0 ? ToolTipIcon.Info : ToolTipIcon.Warning);
    }

    private void CopyCommercialPlayerUrl()
    {
        try
        {
            Clipboard.SetText(CommercialBreakPaths.PlayerUrl);
            _notifyIcon.ShowBalloonTip(
                2_000,
                "Permanent TikTok Studio source copied",
                CommercialBreakPaths.PlayerUrl,
                ToolTipIcon.Info);
        }
        catch (Exception error)
        {
            BridgeLog.Write("Commercial player URL could not be copied.", error);
            MessageBox.Show(
                CommercialBreakPaths.PlayerUrl,
                "Copy the permanent TikTok Studio source",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
    }

    private static string FormatDuration(TimeSpan duration) =>
        duration.TotalMinutes >= 1
            ? $"{(int)duration.TotalMinutes}:{duration.Seconds:00}"
            : $"0:{duration.Seconds:00}";

    protected override void ExitThreadCore()
    {
        if (_shuttingDown) return;
        _shuttingDown = true;
        _commercials.Stop();
        _statusTimer.Stop();
        _statusTimer.Dispose();
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _server.Dispose();
        BridgeLog.Write("BARCODE Commercial Player exited.");
        base.ExitThreadCore();
    }
}
