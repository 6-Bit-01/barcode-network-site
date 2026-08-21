using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Barcode.AudioBridge;

internal sealed class LoopbackCaptureController : IDisposable
{
    private readonly object _sync = new();
    private readonly AudioAnalyzer _analyzer = new();
    private readonly System.Threading.Timer _idleTimer;
    private WasapiLoopbackCapture? _capture;
    private MMDevice? _renderDevice;
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
        get
        {
            string status;
            bool captureActive;
            lock (_sync)
            {
                status = _status;
                captureActive = _capture is not null;
            }
            if (!captureActive) return status;

            var signal = _analyzer.Snapshot(true);
            if (!signal.WarmedUp) return "Connected — warming up Speakers audio analysis";
            var level = (int)Math.Round(Math.Max(signal.Energy, signal.Peak) * 100);
            return signal.Silence
                ? $"Connected — no Speakers audio detected (level {level}%)"
                : $"Live — Speakers audio detected (level {level}%)";
        }
    }

    public bool CaptureActive
    {
        get { lock (_sync) return _capture is not null; }
    }

    public string TrayTooltip
    {
        get
        {
            if (!CaptureActive) return "BARCODE Audio Bridge — ready";

            var signal = _analyzer.Snapshot(true);
            if (!signal.WarmedUp) return "BARCODE Audio Bridge — warming up";
            return signal.Silence
                ? "BARCODE Audio Bridge — no Speakers audio"
                : "BARCODE Audio Bridge — LIVE audio";
        }
    }

    public void TouchClient()
    {
        lock (_sync) _lastClientRequest = DateTimeOffset.UtcNow;
        EnsureStarted();
    }

    public void ReportBrowserHandshake(string status)
    {
        lock (_sync)
        {
            if (_disposed || _capture is not null) return;
            _status = status;
        }
    }

    public AudioSignal Snapshot() => _analyzer.Snapshot(CaptureActive);

    private void EnsureStarted()
    {
        lock (_sync)
        {
            if (_disposed || _capture is not null || DateTimeOffset.UtcNow - _lastStartAttempt < TimeSpan.FromSeconds(2)) return;
            _lastStartAttempt = DateTimeOffset.UtcNow;
            WasapiLoopbackCapture? capture = null;
            MMDevice? renderDevice = null;
            try
            {
                using var enumerator = new MMDeviceEnumerator();
                renderDevice = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                capture = new WasapiLoopbackCapture(renderDevice);
                capture.DataAvailable += OnDataAvailable;
                capture.RecordingStopped += OnRecordingStopped;
                capture.StartRecording();
                _capture = capture;
                _renderDevice = renderDevice;
                _status = "Connected — warming up Speakers audio analysis";
                BridgeLog.Write($"Speakers loopback started ({capture.WaveFormat.SampleRate} Hz, {capture.WaveFormat.Channels} channels, {capture.WaveFormat.BitsPerSample}-bit, {capture.WaveFormat.Encoding}).");
                capture = null;
                renderDevice = null;
            }
            catch (Exception error)
            {
                if (capture is not null)
                {
                    capture.DataAvailable -= OnDataAvailable;
                    capture.RecordingStopped -= OnRecordingStopped;
                    capture.Dispose();
                }
                renderDevice?.Dispose();
                _status = "Speakers capture unavailable — visual fallback remains active";
                BridgeLog.Write("Speakers loopback could not start.", error);
            }
        }
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs args)
    {
        WasapiLoopbackCapture? capture;
        MMDevice? renderDevice;
        lock (_sync)
        {
            capture = _capture;
            renderDevice = _renderDevice;
        }
        if (capture is null) return;
        try
        {
            var sampleGain = EndpointVolumeCompensation.NeutralSampleGain;
            try
            {
                sampleGain = EndpointVolumeCompensation.SampleGainFromEndpointDecibels(
                    renderDevice?.AudioEndpointVolume.MasterVolumeLevel);
            }
            catch
            {
                // Endpoint changes and driver resets can briefly make the COM
                // volume control unavailable. Keep the frame with neutral gain;
                // capture recovery remains owned by RecordingStopped.
            }
            _analyzer.AddSamples(args.Buffer, args.BytesRecorded, capture.WaveFormat, sampleGain);
        }
        catch (Exception error)
        {
            BridgeLog.Write("An audio analysis frame was discarded.", error);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs args)
    {
        WasapiLoopbackCapture? stoppedCapture;
        MMDevice? stoppedDevice;
        lock (_sync)
        {
            if (!ReferenceEquals(sender, _capture)) return;
            stoppedCapture = _capture;
            stoppedDevice = _renderDevice;
            _capture = null;
            _renderDevice = null;
            _status = "Speakers capture interrupted — retrying while visuals remain active";
        }
        if (stoppedCapture is not null)
        {
            stoppedCapture.DataAvailable -= OnDataAvailable;
            stoppedCapture.RecordingStopped -= OnRecordingStopped;
            stoppedCapture.Dispose();
        }
        stoppedDevice?.Dispose();
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
        MMDevice? renderDevice;
        lock (_sync)
        {
            capture = _capture;
            renderDevice = _renderDevice;
            _capture = null;
            _renderDevice = null;
            _status = nextStatus;
        }
        if (capture is null)
        {
            renderDevice?.Dispose();
            return;
        }
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
        finally
        {
            renderDevice?.Dispose();
        }
    }

    public void Dispose()
    {
        lock (_sync) _disposed = true;
        _idleTimer.Dispose();
        StopCapture("Stopped");
    }
}
