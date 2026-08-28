namespace Barcode.AudioBridge;

internal sealed record PerceptualAudioBands(
    double SubBass,
    double Bass,
    double LowMid,
    double Mid,
    double HighMid,
    double Presence,
    double Brilliance,
    double Air);

internal sealed record PerceptualAudioFeatures(
    string Version,
    PerceptualAudioBands Levels,
    PerceptualAudioBands Onsets,
    double SpectralCentroid,
    double Brightness,
    double DynamicRange,
    double TransientDensity,
    double StereoWidth,
    double StereoBalance,
    double[] Waveform);

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
    double TempoConfidence,
    PerceptualAudioFeatures Features);
