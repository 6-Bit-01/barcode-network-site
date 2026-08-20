namespace Barcode.AudioBridge;

internal static class BridgeConstants
{
    public const int Port = 43120;
    public const string SchemaVersion = "barcode_audio_signal_v1";
    public const string Source = "windows_loopback";
    public const string AutoStartValueName = "BARCODE Audio Bridge";
    public const string MutexName = @"Local\BARCODE.AudioBridge.Singleton";
    public const int ClientIdleCaptureStopMilliseconds = 4_000;
}
