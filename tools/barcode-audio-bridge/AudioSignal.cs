namespace Barcode.AudioBridge;

internal sealed record AudioSignal(
    string SchemaVersion,
    string Source,
    string AnalysisCalibration,
    long CapturedAtUnixMs,
    long Sequence,
    bool CaptureActive,
    bool WarmedUp,
    bool Silence,
    double Energy,
    double Bass,
    double Mid,
    double Treble,
    double Peak,
    double Beat,
    double Bpm,
    double TempoConfidence);
