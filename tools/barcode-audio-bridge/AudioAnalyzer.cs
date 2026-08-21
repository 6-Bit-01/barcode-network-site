using NAudio.Wave;

namespace Barcode.AudioBridge;

internal sealed class AudioAnalyzer
{
    private const int FftSize = 2_048;
    private const int SpectrumBins = FftSize / 2;
    private readonly object _sync = new();
    private readonly double[] _window = new double[FftSize];
    private readonly double[] _previousSpectrum = new double[SpectrumBins];
    private readonly Queue<double> _beatIntervalsMilliseconds = new();
    private int _windowIndex;
    private int _sampleRate = 48_000;
    private long _sequence;
    private long _lastDataUnixMs;
    private long _lastBeatUnixMs;
    private double _energy;
    private double _bass;
    private double _mid;
    private double _treble;
    private double _peak;
    private double _energyFloor = 0.05;
    private double _fluxFloor = 0.01;
    private double _bpm = 112;
    private double _tempoConfidence;

    public void AddSamples(
        byte[] buffer,
        int bytesRecorded,
        WaveFormat format,
        double sampleGain = EndpointVolumeCompensation.NeutralSampleGain)
    {
        if (buffer.Length == 0 || bytesRecorded <= 0 || format.SampleRate <= 0 || format.Channels <= 0) return;
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = Math.Max(bytesPerSample * format.Channels, format.BlockAlign);
        var standardFormat = format is WaveFormatExtensible extensible
            ? extensible.ToStandardWaveFormat()
            : format;
        var floatingPoint = standardFormat.Encoding == WaveFormatEncoding.IeeeFloat;

        lock (_sync)
        {
            _sampleRate = format.SampleRate;
            for (var frameOffset = 0; frameOffset + frameBytes <= bytesRecorded; frameOffset += frameBytes)
            {
                double mono = 0;
                var decodedChannels = 0;
                for (var channel = 0; channel < format.Channels; channel += 1)
                {
                    var sampleOffset = frameOffset + channel * bytesPerSample;
                    if (sampleOffset + bytesPerSample > bytesRecorded) break;
                    mono += DecodeSample(buffer, sampleOffset, bytesPerSample, floatingPoint);
                    decodedChannels += 1;
                }
                if (decodedChannels == 0) continue;
                _window[_windowIndex] = EndpointVolumeCompensation.Apply(
                    mono / decodedChannels,
                    sampleGain);
                _windowIndex += 1;
                if (_windowIndex == FftSize)
                {
                    AnalyzeWindow(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                    _windowIndex = 0;
                }
            }
        }
    }

    public AudioSignal Snapshot(bool captureActive)
    {
        lock (_sync)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var age = _lastDataUnixMs == 0 ? long.MaxValue : Math.Max(0, now - _lastDataUnixMs);
            var silence = age > 650 || _energy < 0.008;
            var decay = age <= 650 ? 1 : Math.Exp(-(age - 650) / 480d);
            var beat = _lastBeatUnixMs == 0 ? 0 : Math.Exp(-Math.Max(0, now - _lastBeatUnixMs) / 145d);
            if (silence) beat = 0;

            return new AudioSignal(
                BridgeConstants.SchemaVersion,
                BridgeConstants.Source,
                now,
                _sequence,
                captureActive,
                _sequence >= 3,
                silence,
                Unit(_energy * decay),
                Unit(_bass * decay),
                Unit(_mid * decay),
                Unit(_treble * decay),
                Unit(_peak * decay),
                Unit(beat),
                Math.Clamp(_bpm, 40, 240),
                Unit(_tempoConfidence));
        }
    }

    private void AnalyzeWindow(long nowUnixMs)
    {
        var real = new double[FftSize];
        var imaginary = new double[FftSize];
        double squared = 0;
        double peak = 0;
        for (var index = 0; index < FftSize; index += 1)
        {
            var sample = _window[index];
            squared += sample * sample;
            peak = Math.Max(peak, Math.Abs(sample));
            real[index] = sample * (0.5 - 0.5 * Math.Cos(2 * Math.PI * index / (FftSize - 1)));
        }

        Transform(real, imaginary);
        var spectrum = new double[SpectrumBins];
        double flux = 0;
        for (var bin = 1; bin < SpectrumBins; bin += 1)
        {
            var magnitude = 2 * Math.Sqrt(real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) / FftSize;
            spectrum[bin] = magnitude;
            flux += Math.Max(0, magnitude - _previousSpectrum[bin]);
            _previousSpectrum[bin] = magnitude;
        }

        var rms = Math.Sqrt(squared / FftSize);
        var energy = Unit(Math.Pow(rms * 3.9, 0.72));
        var bass = BandEnergy(spectrum, 30, 250, 5.4);
        var mid = BandEnergy(spectrum, 250, 2_400, 4.6);
        var treble = BandEnergy(spectrum, 2_400, Math.Min(14_000, _sampleRate / 2d), 4.2);
        var normalizedFlux = Unit(Math.Pow(flux * 3.2, 0.58));

        _energy = Smooth(_energy, energy, 0.62, 0.22);
        _bass = Smooth(_bass, bass, 0.65, 0.2);
        _mid = Smooth(_mid, mid, 0.54, 0.2);
        _treble = Smooth(_treble, treble, 0.48, 0.24);
        _peak = Math.Max(Unit(peak), _peak * 0.72);
        _energyFloor = _energyFloor * 0.965 + energy * 0.035;
        _fluxFloor = _fluxFloor * 0.955 + normalizedFlux * 0.045;
        _lastDataUnixMs = nowUnixMs;
        _sequence += 1;

        var sinceBeat = _lastBeatUnixMs == 0 ? long.MaxValue : nowUnixMs - _lastBeatUnixMs;
        var energetic = energy > Math.Max(0.075, _energyFloor * 1.18);
        var transient = normalizedFlux > Math.Max(0.055, _fluxFloor * 1.28);
        if (sinceBeat >= 240 && energetic && transient)
        {
            RegisterBeat(nowUnixMs, sinceBeat);
        }
    }

    private void RegisterBeat(long nowUnixMs, long intervalMilliseconds)
    {
        if (_lastBeatUnixMs > 0 && intervalMilliseconds is >= 250 and <= 1_500)
        {
            _beatIntervalsMilliseconds.Enqueue(intervalMilliseconds);
            while (_beatIntervalsMilliseconds.Count > 16) _beatIntervalsMilliseconds.Dequeue();
            var tempos = _beatIntervalsMilliseconds
                .Select(interval => NormalizeTempo(60_000d / interval))
                .OrderBy(value => value)
                .ToArray();
            if (tempos.Length > 0)
            {
                var median = tempos[tempos.Length / 2];
                var deviation = tempos.Average(value => Math.Abs(value - median));
                _bpm = _bpm * 0.42 + median * 0.58;
                _tempoConfidence = Unit(Math.Min(1, tempos.Length / 8d) * (1 - Math.Min(1, deviation / 20d)));
            }
        }
        _lastBeatUnixMs = nowUnixMs;
    }

    private double BandEnergy(double[] spectrum, double startHz, double endHz, double sensitivity)
    {
        var start = Math.Max(1, (int)Math.Floor(startHz * FftSize / _sampleRate));
        var end = Math.Min(SpectrumBins, Math.Max(start + 1, (int)Math.Ceiling(endHz * FftSize / _sampleRate)));
        double squared = 0;
        for (var bin = start; bin < end; bin += 1) squared += spectrum[bin] * spectrum[bin];
        return Unit(Math.Pow(Math.Sqrt(squared) * sensitivity, 0.58));
    }

    private static double DecodeSample(byte[] buffer, int offset, int bytesPerSample, bool floatingPoint)
    {
        if (floatingPoint && bytesPerSample == 4)
        {
            var sample = BitConverter.ToSingle(buffer, offset);
            return float.IsFinite(sample) ? sample : 0;
        }
        if (bytesPerSample == 4) return BitConverter.ToInt32(buffer, offset) / 2_147_483_648d;
        if (bytesPerSample == 3)
        {
            var sample = buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16;
            if ((sample & 0x800000) != 0) sample |= unchecked((int)0xff000000);
            return sample / 8_388_608d;
        }
        if (bytesPerSample == 2) return BitConverter.ToInt16(buffer, offset) / 32_768d;
        return (buffer[offset] - 128) / 128d;
    }

    private static void Transform(double[] real, double[] imaginary)
    {
        var length = real.Length;
        for (int index = 1, reverse = 0; index < length; index += 1)
        {
            var bit = length >> 1;
            for (; (reverse & bit) != 0; bit >>= 1) reverse ^= bit;
            reverse ^= bit;
            if (index >= reverse) continue;
            (real[index], real[reverse]) = (real[reverse], real[index]);
            (imaginary[index], imaginary[reverse]) = (imaginary[reverse], imaginary[index]);
        }

        for (var size = 2; size <= length; size <<= 1)
        {
            var angle = -2 * Math.PI / size;
            var stepReal = Math.Cos(angle);
            var stepImaginary = Math.Sin(angle);
            for (var start = 0; start < length; start += size)
            {
                double unitReal = 1;
                double unitImaginary = 0;
                for (var offset = 0; offset < size / 2; offset += 1)
                {
                    var even = start + offset;
                    var odd = even + size / 2;
                    var oddReal = real[odd] * unitReal - imaginary[odd] * unitImaginary;
                    var oddImaginary = real[odd] * unitImaginary + imaginary[odd] * unitReal;
                    real[odd] = real[even] - oddReal;
                    imaginary[odd] = imaginary[even] - oddImaginary;
                    real[even] += oddReal;
                    imaginary[even] += oddImaginary;
                    var nextReal = unitReal * stepReal - unitImaginary * stepImaginary;
                    unitImaginary = unitReal * stepImaginary + unitImaginary * stepReal;
                    unitReal = nextReal;
                }
            }
        }
    }

    private static double Smooth(double previous, double next, double attack, double release)
    {
        var amount = next > previous ? attack : release;
        return previous + (next - previous) * amount;
    }

    private static double NormalizeTempo(double bpm)
    {
        while (bpm < 72) bpm *= 2;
        while (bpm > 176) bpm /= 2;
        return bpm;
    }

    private static double Unit(double value) => double.IsFinite(value) ? Math.Clamp(value, 0, 1) : 0;
}

internal static class EndpointVolumeCompensation
{
    public const double NeutralSampleGain = 1;
    private const double MinimumEndpointDecibels = -120;
    private const double MaximumEndpointDecibels = 24;
    private const double MaximumSampleGain = 100;

    /// <summary>
    /// Convert the render endpoint's decibel attenuation into the inverse
    /// linear sample gain needed to reconstruct the pre-volume signal.
    /// Invalid or unavailable endpoint readings deliberately preserve the
    /// previous analyzer behavior instead of dropping an audio frame.
    /// </summary>
    public static double SampleGainFromEndpointDecibels(double? endpointDecibels)
    {
        if (endpointDecibels is not double decibels
            || !double.IsFinite(decibels)
            || decibels < MinimumEndpointDecibels
            || decibels > MaximumEndpointDecibels)
        {
            return NeutralSampleGain;
        }

        var endpointAmplitude = Math.Pow(10, decibels / 20d);
        if (!double.IsFinite(endpointAmplitude) || endpointAmplitude <= 0) return NeutralSampleGain;

        var sampleGain = 1 / endpointAmplitude;
        return double.IsFinite(sampleGain) && sampleGain > 0
            ? Math.Min(sampleGain, MaximumSampleGain)
            : NeutralSampleGain;
    }

    public static double Apply(double sample, double sampleGain)
    {
        if (!double.IsFinite(sample)) return 0;
        var safeGain = double.IsFinite(sampleGain) && sampleGain > 0
            ? sampleGain
            : NeutralSampleGain;
        return Math.Clamp(sample * safeGain, -1, 1);
    }
}
