using NAudio.Wave;

namespace Barcode.AudioBridge;

internal sealed class LoopbackCaptureController : IDisposable
{
    private readonly object _sync = new();
    private readonly AudioAnalyzer _analyzer = new();
    private readonly System.Threading.Timer _idleTimer;
    private WasapiLoopbackCapture? _capture;
    private DateTimeOffset _lastClientRequest = DateTimeOffset.MinValue;
    private DateTimeOffset _lastStartAttempt = DateTimeOffset.MinValue;
    private string _status = "Waiting for a live visuals session";
    private bool _disposed;

    public LoopbackCaptureController()
    {
        _idleTimer = new System.Threading.Timer(CheckIdle, null, 1_000, 1_000);
    }

    public string Status
    {
        get { lock (_sync) return _status; }
    }

    public bool CaptureActive
    {
        get { lock (_sync) return _capture is not null; }
    }

    public void TouchClient()
    {
        lock (_sync) _lastClientRequest = DateTimeOffset.UtcNow;
        EnsureStarted();
    }

    public AudioSignal Snapshot() => _analyzer.Snapshot(CaptureActive);

    private void EnsureStarted()
    {
        lock (_sync)
        {
            if (_disposed || _capture is not null || DateTimeOffset.UtcNow - _lastStartAttempt < TimeSpan.FromSeconds(2)) return;
            _lastStartAttempt = DateTimeOffset.UtcNow;
            try
            {
                var capture = new WasapiLoopbackCapture();
                capture.DataAvailable += OnDataAvailable;
                capture.RecordingStopped += OnRecordingStopped;
                capture.StartRecording();
                _capture = capture;
                _status = "Live — Speakers loopback is driving the visuals";
                BridgeLog.Write($"Speakers loopback started ({capture.WaveFormat.SampleRate} Hz, {capture.WaveFormat.Channels} channels, {capture.WaveFormat.BitsPerSample}-bit).");
            }
            catch (Exception error)
            {
                _status = "Speakers capture unavailable — visual fallback remains active";
                BridgeLog.Write("Speakers loopback could not start.", error);
            }
        }
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs args)
    {
        WasapiLoopbackCapture? capture;
        lock (_sync) capture = _capture;
        if (capture is null) return;
        try
        {
            _analyzer.AddSamples(args.Buffer, args.BytesRecorded, capture.WaveFormat);
        }
        catch (Exception error)
        {
            BridgeLog.Write("An audio analysis frame was discarded.", error);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs args)
    {
        WasapiLoopbackCapture? stoppedCapture;
        lock (_sync)
        {
            if (!ReferenceEquals(sender, _capture)) return;
            stoppedCapture = _capture;
            _capture = null;
            _status = "Speakers capture interrupted — retrying while visuals remain active";
        }
        if (stoppedCapture is not null)
        {
            stoppedCapture.DataAvailable -= OnDataAvailable;
            stoppedCapture.RecordingStopped -= OnRecordingStopped;
            stoppedCapture.Dispose();
        }
        BridgeLog.Write("Speakers loopback stopped unexpectedly.", args.Exception);
    }

    private void CheckIdle(object? state)
    {
        bool shouldStop;
        lock (_sync)
        {
            shouldStop = !_disposed
                && _capture is not null
                && DateTimeOffset.UtcNow - _lastClientRequest > TimeSpan.FromMilliseconds(BridgeConstants.ClientIdleCaptureStopMilliseconds);
        }
        if (shouldStop) StopCapture("Waiting for a live visuals session");
    }

    private void StopCapture(string nextStatus)
    {
        WasapiLoopbackCapture? capture;
        lock (_sync)
        {
            capture = _capture;
            _capture = null;
            _status = nextStatus;
        }
        if (capture is null) return;
        try
        {
            capture.DataAvailable -= OnDataAvailable;
            capture.RecordingStopped -= OnRecordingStopped;
            capture.StopRecording();
            capture.Dispose();
            BridgeLog.Write("Speakers loopback stopped after the visuals session went idle.");
        }
        catch (Exception error)
        {
            BridgeLog.Write("Speakers loopback cleanup reported an error.", error);
        }
    }

    public void Dispose()
    {
        lock (_sync) _disposed = true;
        _idleTimer.Dispose();
        StopCapture("Stopped");
    }
}
