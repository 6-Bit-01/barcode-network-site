using NAudio.Wave;

namespace Barcode.AudioBridge;

internal sealed class AudioAnalyzer
{
    private const int FftSize = 2_048;
    private const int AnalysisHopSize = FftSize / 2;
    private const int SpectrumBins = FftSize / 2;
    private const int PerceptualBandCount = 8;
    private const int WaveformPointCount = 16;
    private const int TransientDensityWindowMilliseconds = 2_500;
    private const int TransientRefractoryMilliseconds = 55;
    private static readonly (double StartHz, double EndHz, double LevelSensitivity, double OnsetRelease)[] PerceptualBandDefinitions =
    [
        (25, 70, 7.2, 0.78),
        (70, 180, 6.2, 0.75),
        (180, 450, 5.5, 0.72),
        (450, 1_200, 5.0, 0.68),
        (1_200, 3_000, 4.7, 0.64),
        (3_000, 6_000, 4.5, 0.58),
        (6_000, 12_000, 4.8, 0.52),
        (12_000, 18_000, 5.2, 0.48),
    ];
    private readonly object _sync = new();
    private readonly double[] _window = new double[FftSize];
    private readonly double[] _leftWindow = new double[FftSize];
    private readonly double[] _rightWindow = new double[FftSize];
    private readonly double[] _previousSpectrum = new double[SpectrumBins];
    private readonly double[] _perceptualBandLevels = new double[PerceptualBandCount];
    private readonly double[] _visualPerceptualBandLevels = new double[PerceptualBandCount];
    private readonly double[] _perceptualBandOnsets = new double[PerceptualBandCount];
    private readonly double[] _perceptualNoveltyFloors = Enumerable.Repeat(0.012, PerceptualBandCount).ToArray();
    private readonly double[] _waveform = new double[WaveformPointCount];
    private readonly Queue<double> _beatIntervalsMilliseconds = new();
    private readonly Queue<long> _transientArrivalSequences = new();
    private int _windowIndex;
    private int _sampleRate = 48_000;
    private long _sequence;
    private long _lastDataUnixMs;
    private long _lastBeatUnixMs;
    private long _lastTransientSequence = -10_000;
    private double _energy;
    private double _bass;
    private double _mid;
    private double _treble;
    private double _peak;
    private double _visualEnergy;
    private double _visualBass;
    private double _visualMid;
    private double _visualTreble;
    private double _visualPeak;
    private double _energyFloor = 0.05;
    private double _fluxFloor = 0.01;
    private double _bpm = 112;
    private double _tempoConfidence;
    private double _spectralCentroid;
    private double _brightness;
    private double _dynamicRange;
    private double _transientDensity;
    private double _stereoWidth;
    private double _stereoBalance;
    private readonly AdaptiveProgramGain _programGain = new(
        minimumCeiling: 0.16,
        targetLevel: 0.58,
        maximumGain: 2.6);

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
                double left = 0;
                double right = 0;
                var decodedChannels = 0;
                for (var channel = 0; channel < format.Channels; channel += 1)
                {
                    var sampleOffset = frameOffset + channel * bytesPerSample;
                    if (sampleOffset + bytesPerSample > bytesRecorded) break;
                    var sample = DecodeSample(buffer, sampleOffset, bytesPerSample, floatingPoint);
                    mono += sample;
                    if (channel == 0) left = sample;
                    if (channel == 1) right = sample;
                    decodedChannels += 1;
                }
                if (decodedChannels == 0) continue;
                if (decodedChannels == 1) right = left;
                _window[_windowIndex] = EndpointVolumeCompensation.ApplyForAnalysis(
                    mono / decodedChannels,
                    sampleGain);
                _leftWindow[_windowIndex] = EndpointVolumeCompensation.ApplyForAnalysis(left, sampleGain);
                _rightWindow[_windowIndex] = EndpointVolumeCompensation.ApplyForAnalysis(right, sampleGain);
                _windowIndex += 1;
                if (_windowIndex == FftSize)
                {
                    AnalyzeWindow(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                    // Keep half the previous FFT window. The 2,048-sample
                    // frequency resolution stays intact while levels refresh
                    // every 1,024 samples (~21 ms at 48 kHz) instead of every
                    // ~43 ms. This materially reduces visible lag without
                    // weakening bass-bin resolution.
                    Array.Copy(_window, AnalysisHopSize, _window, 0, AnalysisHopSize);
                    Array.Copy(_leftWindow, AnalysisHopSize, _leftWindow, 0, AnalysisHopSize);
                    Array.Copy(_rightWindow, AnalysisHopSize, _rightWindow, 0, AnalysisHopSize);
                    _windowIndex = AnalysisHopSize;
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
            var silence = age > 650 || (_energy < 0.0015 && _peak < 0.002);
            var decay = age <= 650 ? 1 : Math.Exp(-(age - 650) / 480d);
            var beat = _lastBeatUnixMs == 0 ? 0 : Math.Exp(-Math.Max(0, now - _lastBeatUnixMs) / 145d);
            if (silence) beat = 0;

            return new AudioSignal(
                BridgeConstants.SchemaVersion,
                BridgeConstants.Source,
                BridgeConstants.AnalysisCalibration,
                now,
                _sequence,
                captureActive,
                _sequence >= 3,
                silence,
                Unit(_visualEnergy * decay),
                Unit(_visualBass * decay),
                Unit(_visualMid * decay),
                Unit(_visualTreble * decay),
                Unit(_visualPeak * decay),
                Unit(beat),
                Math.Clamp(_bpm, 40, 240),
                Unit(_tempoConfidence),
                PerceptualFeaturesSnapshot(silence ? 0 : decay));
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
        }

        var rms = Math.Sqrt(squared / FftSize);
        var energy = Unit(Math.Pow(rms * 3.9, 0.72));
        var bass = BandEnergy(spectrum, 30, 250, 5.4);
        // Visual bands deliberately overlap at their shoulders. Vocals carry
        // useful body below 250 Hz and intelligibility above 2.4 kHz; the old
        // hard split could therefore leave vocal-led passages with no owned
        // visual layer even though the song was plainly audible.
        var mid = BandEnergy(spectrum, 180, 4_000, 4.35);
        var treble = BandEnergy(spectrum, 2_800, Math.Min(16_000, _sampleRate / 2d), 4.1);
        var normalizedFlux = Unit(Math.Pow(flux * 3.2, 0.58));

        _energy = Smooth(_energy, energy, 0.72, 0.28);
        _bass = Smooth(_bass, bass, 0.74, 0.24);
        _mid = Smooth(_mid, mid, 0.8, 0.27);
        _treble = Smooth(_treble, treble, 0.82, 0.3);
        _peak = Math.Max(Unit(peak), _peak * 0.58);

        var audibility = MusicalAudibility(_energy, _peak);
        // One shared adaptive gain follows the complete program. Applying a
        // different recent-range normalizer to every FFT band made ordinary
        // music publish bass, mids, and treble at nearly the same hot level,
        // erasing the spectral contrast the twenty renderers rely on. A common
        // gain still reveals a quiet master or fade-in while preserving the
        // real relationship and movement between every band.
        var visualGain = _programGain.Resolve(_energy, audibility);
        _visualEnergy = VisualLevel(_energy, visualGain, audibility);
        _visualBass = VisualLevel(_bass, visualGain, audibility);
        _visualMid = VisualLevel(_mid, visualGain, audibility);
        _visualTreble = VisualLevel(_treble, visualGain, audibility);
        _visualPeak = VisualLevel(_peak, visualGain, audibility);
        AnalyzePerceptualFeatures(spectrum, rms, peak, visualGain, audibility);
        Array.Copy(spectrum, _previousSpectrum, SpectrumBins);

        _energyFloor = _energyFloor * 0.982 + energy * 0.018;
        _fluxFloor = _fluxFloor * 0.975 + normalizedFlux * 0.025;
        _lastDataUnixMs = nowUnixMs;
        _sequence += 1;

        var sinceBeat = _lastBeatUnixMs == 0 ? long.MaxValue : nowUnixMs - _lastBeatUnixMs;
        // Fade and vocal visibility belong to the sustained band channels;
        // they must not lower the hit detector until every spectral change is
        // promoted into a metronomic pulse. Keep the accepted refractory and
        // relative transient gate for actual arrivals.
        var energetic = energy > Math.Max(0.075, _energyFloor * 1.18);
        var transient = normalizedFlux > Math.Max(0.055, _fluxFloor * 1.28);
        if (sinceBeat >= 240 && energetic && transient)
        {
            RegisterBeat(nowUnixMs, sinceBeat);
        }
    }

    private void AnalyzePerceptualFeatures(
        double[] spectrum,
        double rms,
        double peak,
        double visualGain,
        double audibility)
    {
        var strongestArrival = 0d;
        for (var index = 0; index < PerceptualBandDefinitions.Length; index += 1)
        {
            var definition = PerceptualBandDefinitions[index];
            var upperHz = Math.Min(definition.EndHz, _sampleRate / 2d);
            var rawLevel = upperHz > definition.StartHz
                ? BandEnergy(spectrum, definition.StartHz, upperHz, definition.LevelSensitivity)
                : 0;
            _perceptualBandLevels[index] = Smooth(
                _perceptualBandLevels[index],
                rawLevel,
                index <= 1 ? 0.76 : index <= 4 ? 0.81 : 0.85,
                index <= 1 ? 0.22 : index <= 4 ? 0.27 : 0.31);
            _visualPerceptualBandLevels[index] = VisualLevel(
                _perceptualBandLevels[index],
                visualGain,
                audibility);

            var novelty = upperHz > definition.StartHz
                ? BandNovelty(spectrum, definition.StartHz, upperHz)
                : 0;
            var noveltyFloor = _perceptualNoveltyFloors[index];
            var onsetTarget = _sequence >= 2 && _visualPerceptualBandLevels[index] > 0.012
                ? Unit(Math.Max(0, novelty - Math.Max(0.018, noveltyFloor * 1.12)) * 2.75)
                : 0;
            _perceptualBandOnsets[index] = Math.Max(
                onsetTarget,
                _perceptualBandOnsets[index] * definition.OnsetRelease);
            _perceptualNoveltyFloors[index] = noveltyFloor * 0.985 + novelty * 0.015;
            strongestArrival = Math.Max(strongestArrival, onsetTarget);
        }

        var transientWindowHops = Math.Max(1, (int)Math.Ceiling(
            TransientDensityWindowMilliseconds * _sampleRate / (AnalysisHopSize * 1_000d)));
        var transientRefractoryHops = Math.Max(1, (int)Math.Ceiling(
            TransientRefractoryMilliseconds * _sampleRate / (AnalysisHopSize * 1_000d)));
        if (strongestArrival >= 0.16 && _sequence - _lastTransientSequence >= transientRefractoryHops)
        {
            _transientArrivalSequences.Enqueue(_sequence);
            _lastTransientSequence = _sequence;
        }
        while (_transientArrivalSequences.Count > 0
            && _sequence - _transientArrivalSequences.Peek() > transientWindowHops)
        {
            _transientArrivalSequences.Dequeue();
        }
        _transientDensity = Smooth(
            _transientDensity,
            Unit(_transientArrivalSequences.Count / 18d),
            0.42,
            0.08);

        double spectralWeight = 0;
        double weightedFrequency = 0;
        double brightWeight = 0;
        for (var bin = 1; bin < SpectrumBins; bin += 1)
        {
            var frequency = bin * _sampleRate / (double)FftSize;
            var weight = spectrum[bin] * spectrum[bin];
            spectralWeight += weight;
            weightedFrequency += frequency * weight;
            if (frequency >= 3_000) brightWeight += weight;
        }
        var centroidHz = spectralWeight > 1e-12 ? weightedFrequency / spectralWeight : 0;
        var centroidCeiling = Math.Min(18_000, _sampleRate / 2d);
        var centroidTarget = centroidHz > 25 && centroidCeiling > 25
            ? Unit(Math.Log(centroidHz / 25) / Math.Log(centroidCeiling / 25))
            : 0;
        var brightnessTarget = spectralWeight > 1e-12
            ? Unit(Math.Sqrt(brightWeight / spectralWeight))
            : 0;
        _spectralCentroid = Smooth(_spectralCentroid, centroidTarget, 0.48, 0.18);
        _brightness = Smooth(_brightness, brightnessTarget, 0.52, 0.2);

        var crestDecibels = rms > 1e-8 && peak > 1e-8
            ? 20 * Math.Log10(peak / rms)
            : 0;
        var dynamicRangeTarget = Unit((crestDecibels - 3) / 15);
        _dynamicRange = Smooth(_dynamicRange, dynamicRangeTarget, 0.28, 0.12);

        AnalyzeStereoImage();
        AnalyzeWaveform(peak);
    }

    private double BandNovelty(double[] spectrum, double startHz, double endHz)
    {
        var start = Math.Max(1, (int)Math.Floor(startHz * FftSize / _sampleRate));
        var end = Math.Min(SpectrumBins, Math.Max(start + 1, (int)Math.Ceiling(endHz * FftSize / _sampleRate)));
        double positiveDifference = 0;
        double reference = 0;
        for (var bin = start; bin < end; bin += 1)
        {
            positiveDifference += Math.Max(0, spectrum[bin] - _previousSpectrum[bin]);
            reference += _previousSpectrum[bin] + spectrum[bin] * 0.25;
        }
        if (positiveDifference <= 0) return 0;
        return Unit(Math.Pow(positiveDifference / Math.Max(0.00025, reference), 0.62));
    }

    private void AnalyzeStereoImage()
    {
        double leftSquared = 0;
        double rightSquared = 0;
        double midSquared = 0;
        double sideSquared = 0;
        for (var index = 0; index < FftSize; index += 1)
        {
            var left = _leftWindow[index];
            var right = _rightWindow[index];
            var mid = (left + right) * 0.5;
            var side = (left - right) * 0.5;
            leftSquared += left * left;
            rightSquared += right * right;
            midSquared += mid * mid;
            sideSquared += side * side;
        }
        var leftRms = Math.Sqrt(leftSquared / FftSize);
        var rightRms = Math.Sqrt(rightSquared / FftSize);
        var midRms = Math.Sqrt(midSquared / FftSize);
        var sideRms = Math.Sqrt(sideSquared / FftSize);
        var widthTarget = Unit(sideRms / Math.Max(1e-8, midRms + sideRms));
        var balanceTarget = SignedUnit((rightRms - leftRms) / Math.Max(1e-8, rightRms + leftRms));
        _stereoWidth = Smooth(_stereoWidth, widthTarget, 0.4, 0.2);
        _stereoBalance += (balanceTarget - _stereoBalance) * 0.32;
    }

    private void AnalyzeWaveform(double peak)
    {
        for (var point = 0; point < WaveformPointCount; point += 1)
        {
            var start = point * FftSize / WaveformPointCount;
            var end = Math.Max(start + 1, (point + 1) * FftSize / WaveformPointCount);
            double squared = 0;
            double signedEnergy = 0;
            for (var index = start; index < end; index += 1)
            {
                var sample = _window[index];
                squared += sample * sample;
                signedEnergy += sample * Math.Abs(sample);
            }
            var segmentRms = Math.Sqrt(squared / Math.Max(1, end - start));
            var polarity = signedEnergy < 0 ? -1 : 1;
            // Publish one aggregate shape descriptor for each 128-sample
            // segment rather than a decimated program sample. The resulting
            // sixteen points are useful for visual geometry but cannot be
            // replayed as captured audio.
            var target = peak > 0.001 ? SignedUnit(polarity * segmentRms / peak) : 0;
            _waveform[point] += (target - _waveform[point]) * 0.62;
        }
    }

    private PerceptualAudioFeatures PerceptualFeaturesSnapshot(double decay)
    {
        var activity = Unit(decay);
        var levels = _visualPerceptualBandLevels.Select(value => Unit(value * activity)).ToArray();
        var onsets = _perceptualBandOnsets.Select(value => Unit(value * activity)).ToArray();
        return new PerceptualAudioFeatures(
            BridgeConstants.PerceptualFeaturesVersion,
            PerceptualBandsFrom(levels),
            PerceptualBandsFrom(onsets),
            Unit(_spectralCentroid * activity),
            Unit(_brightness * activity),
            Unit(_dynamicRange * activity),
            Unit(_transientDensity * activity),
            Unit(_stereoWidth * activity),
            SignedUnit(_stereoBalance * activity),
            _waveform.Select(value => SignedUnit(value * activity)).ToArray());
    }

    private static PerceptualAudioBands PerceptualBandsFrom(IReadOnlyList<double> values)
    {
        return new PerceptualAudioBands(
            values[0],
            values[1],
            values[2],
            values[3],
            values[4],
            values[5],
            values[6],
            values[7]);
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

    private static double SignedUnit(double value) => double.IsFinite(value) ? Math.Clamp(value, -1, 1) : 0;

    private static double MusicalAudibility(double energy, double peak)
    {
        var evidence = Math.Max(Unit(energy), Unit(peak));
        if (evidence <= 0.001) return 0;
        return Unit(Math.Pow((evidence - 0.001) / 0.05, 0.45));
    }

    private static double VisualLevel(double level, double visualGain, double audibility)
    {
        if (level <= 0.001 || audibility <= 0) return 0;
        return Unit(level * visualGain);
    }
}

/// <summary>
/// Resolves one bounded gain for the complete already-compressed program.
/// Quiet masters and fade-ins receive useful lift, but every spectral band
/// receives exactly the same multiplier so their real balance and dynamics
/// cannot be flattened into one generic pulse.
/// </summary>
internal sealed class AdaptiveProgramGain
{
    private readonly double _minimumCeiling;
    private readonly double _targetLevel;
    private readonly double _maximumGain;
    private double _recentCeiling;

    public AdaptiveProgramGain(double minimumCeiling, double targetLevel, double maximumGain)
    {
        _minimumCeiling = minimumCeiling;
        _targetLevel = targetLevel;
        _maximumGain = maximumGain;
        _recentCeiling = minimumCeiling;
    }

    public double Resolve(double programLevel, double audibility)
    {
        var input = Unit(programLevel);
        var audible = Unit(audibility);
        if (input > 0.001 && audible > 0 && input > _recentCeiling)
        {
            _recentCeiling += (input - _recentCeiling) * 0.72;
        }
        else
        {
            // Roughly a fourteen-second release at the 1,024-sample hop. A
            // quiet verse after a chorus therefore remains visibly quieter
            // instead of being normalized back to the same apparent volume.
            _recentCeiling = Math.Max(_minimumCeiling, _recentCeiling * 0.9985);
        }

        return Math.Clamp(_targetLevel / Math.Max(_minimumCeiling, _recentCeiling), 1, _maximumGain);
    }

    private static double Unit(double value) => double.IsFinite(value) ? Math.Clamp(value, 0, 1) : 0;
}

internal static class EndpointVolumeCompensation
{
    public const double NeutralSampleGain = 1;
    public const double AnalysisReferenceDecibels = -9;
    public static readonly double AnalysisReferenceGain = Math.Pow(10, AnalysisReferenceDecibels / 20d);
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

    /// <summary>
    /// Reconstruct the volume-neutral program sample, then place it at one
    /// stable internal reference level before RMS, FFT, peak, flux, and beat
    /// analysis. The analyzer was originally tuned against attenuated speaker
    /// samples; feeding it reconstructed full-scale program audio erased that
    /// headroom and made soft songs look permanently maxed.
    /// </summary>
    public static double ApplyForAnalysis(double sample, double sampleGain)
    {
        return Math.Clamp(Apply(sample, sampleGain) * AnalysisReferenceGain, -1, 1);
    }
}
