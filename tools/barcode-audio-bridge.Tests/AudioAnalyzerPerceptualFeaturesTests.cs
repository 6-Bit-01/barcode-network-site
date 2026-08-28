using NAudio.Wave;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class AudioAnalyzerPerceptualFeaturesTests
{
    private const int SampleRate = 48_000;
    private const int Channels = 2;
    private const int FftSize = 2_048;
    private const int AnalysisHopSize = FftSize / 2;
    private static readonly WaveFormat Format = WaveFormat.CreateIeeeFloatWaveFormat(SampleRate, Channels);

    [Fact]
    public void PerceptualBandsSeparateBassVocalAndBrightSongProfiles()
    {
        var bassLed = AnalyzeStereo((frame, _) =>
            Sine(frame, 45) * 0.2
            + Sine(frame, 95) * 0.14
            + Sine(frame, 720) * 0.025);
        var vocalLed = AnalyzeStereo((frame, _) =>
            Sine(frame, 220) * 0.04
            + Sine(frame, 780) * 0.16
            + Sine(frame, 1_900) * 0.11
            + Sine(frame, 3_600) * 0.07);
        var bright = AnalyzeStereo((frame, _) =>
            Sine(frame, 1_500) * 0.035
            + Sine(frame, 6_800) * 0.13
            + Sine(frame, 13_500) * 0.1);

        Assert.Equal(BridgeConstants.PerceptualFeaturesVersion, bassLed.Features.Version);
        Assert.True(bassLed.Features.Levels.SubBass > bassLed.Features.Levels.HighMid,
            $"bass-led material lost its sub ownership: {bassLed.Features.Levels}");
        Assert.True(bassLed.Features.Levels.Bass > bassLed.Features.Levels.Presence,
            $"bass-led material lost its bass ownership: {bassLed.Features.Levels}");
        Assert.True(vocalLed.Features.Levels.Mid > vocalLed.Features.Levels.SubBass,
            $"vocal material did not own the mid band: {vocalLed.Features.Levels}");
        Assert.True(vocalLed.Features.Levels.HighMid > vocalLed.Features.Levels.Bass,
            $"vocal articulation did not own high mids: {vocalLed.Features.Levels}");
        Assert.True(bright.Features.Levels.Brilliance > bright.Features.Levels.LowMid,
            $"bright material did not own brilliance: {bright.Features.Levels}");
        Assert.True(bright.Features.Levels.Air > bright.Features.Levels.Bass,
            $"bright material did not own air: {bright.Features.Levels}");
        Assert.True(bright.Features.SpectralCentroid > bassLed.Features.SpectralCentroid + 0.2,
            $"centroid did not separate bright and bass-led songs: {bassLed.Features.SpectralCentroid} -> {bright.Features.SpectralCentroid}");
        Assert.True(bright.Features.Brightness > bassLed.Features.Brightness + 0.2,
            $"brightness did not separate bright and bass-led songs: {bassLed.Features.Brightness} -> {bright.Features.Brightness}");
    }

    [Fact]
    public void BandArrivalPublishesAnOwnedOnsetInsteadOfOneGlobalPulse()
    {
        var analyzer = new AudioAnalyzer();
        var cursor = 0;
        AddStereo(analyzer, ref cursor, FftSize * 10, (frame, _) => Sine(frame, 850) * 0.05);
        AddStereo(analyzer, ref cursor, AnalysisHopSize, (frame, _) =>
            Sine(frame, 850) * 0.05 + Sine(frame, 90) * 0.32);

        var arrival = analyzer.Snapshot(captureActive: true).Features.Onsets;
        var ownedBassArrival = Math.Max(arrival.SubBass, arrival.Bass);
        var unrelatedHighArrival = Math.Max(arrival.Brilliance, arrival.Air);

        Assert.True(ownedBassArrival > 0.2, $"bass arrival was not exposed: {arrival}");
        Assert.True(unrelatedHighArrival < 0.2,
            $"FFT leakage became a false high-band arrival: {arrival}");
        Assert.True(ownedBassArrival > unrelatedHighArrival + 0.12,
            $"bass arrival leaked into unrelated high bands: {arrival}");
    }

    [Fact]
    public void StereoFeaturesSeparateMonoWidthAndRightHeavyBalance()
    {
        var mono = AnalyzeStereo((frame, _) => Sine(frame, 700) * 0.2);
        var wide = AnalyzeStereo((frame, channel) => channel == 0
            ? Sine(frame, 420) * 0.2
            : Sine(frame, 1_350) * 0.2);
        var rightHeavy = AnalyzeStereo((frame, channel) =>
            Sine(frame, 700) * (channel == 0 ? 0.045 : 0.28));

        Assert.InRange(mono.Features.StereoWidth, 0, 0.015);
        Assert.InRange(Math.Abs(mono.Features.StereoBalance), 0, 0.015);
        Assert.True(wide.Features.StereoWidth > mono.Features.StereoWidth + 0.2,
            $"different left/right material did not produce width: {mono.Features.StereoWidth} -> {wide.Features.StereoWidth}");
        Assert.True(rightHeavy.Features.StereoBalance > 0.45,
            $"right-heavy material did not produce right balance: {rightHeavy.Features.StereoBalance}");
    }

    [Fact]
    public void CrestAndTransientDensityDistinguishPunchyFromSteadyMaterial()
    {
        var steady = AnalyzeStereo((frame, _) => Sine(frame, 900) * 0.18, windowCount: 32);
        var punchy = AnalyzeStereo((frame, _) =>
        {
            var pulse = frame % 2_400 < 96 ? 1d : 0d;
            return Sine(frame, 900) * 0.42 * pulse;
        }, windowCount: 48);

        Assert.True(punchy.Features.DynamicRange > steady.Features.DynamicRange + 0.18,
            $"crest contrast did not separate punchy and steady material: {steady.Features.DynamicRange} -> {punchy.Features.DynamicRange}");
        Assert.True(punchy.Features.TransientDensity > steady.Features.TransientDensity + 0.08,
            $"transient density did not separate punchy and steady material: {steady.Features.TransientDensity} -> {punchy.Features.TransientDensity}");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-12.0412)]
    [InlineData(-30)]
    public void PerceptualFeaturesRemainVolumeNeutral(double endpointDecibels)
    {
        var baseline = AnalyzeStereo((frame, channel) =>
            Sine(frame, channel == 0 ? 85 : 92) * 0.18
            + Sine(frame, 1_100) * 0.09
            + Sine(frame, 7_200) * 0.05,
            endpointDecibels: 0);
        var attenuated = AnalyzeStereo((frame, channel) =>
            Sine(frame, channel == 0 ? 85 : 92) * 0.18
            + Sine(frame, 1_100) * 0.09
            + Sine(frame, 7_200) * 0.05,
            endpointDecibels: endpointDecibels);

        AssertBandsComparable(baseline.Features.Levels, attenuated.Features.Levels);
        Assert.InRange(Math.Abs(baseline.Features.SpectralCentroid - attenuated.Features.SpectralCentroid), 0, 0.015);
        Assert.InRange(Math.Abs(baseline.Features.Brightness - attenuated.Features.Brightness), 0, 0.015);
        Assert.InRange(Math.Abs(baseline.Features.StereoWidth - attenuated.Features.StereoWidth), 0, 0.015);
        Assert.InRange(Math.Abs(baseline.Features.StereoBalance - attenuated.Features.StereoBalance), 0, 0.015);
    }

    [Fact]
    public void DigitalSilenceZerosEveryPerceptualFeatureAndWaveformPoint()
    {
        var signal = AnalyzeStereo((_, _) => 0);

        Assert.True(signal.Silence);
        Assert.Equal(new PerceptualAudioBands(0, 0, 0, 0, 0, 0, 0, 0), signal.Features.Levels);
        Assert.Equal(new PerceptualAudioBands(0, 0, 0, 0, 0, 0, 0, 0), signal.Features.Onsets);
        Assert.Equal(0, signal.Features.SpectralCentroid);
        Assert.Equal(0, signal.Features.Brightness);
        Assert.Equal(0, signal.Features.DynamicRange);
        Assert.Equal(0, signal.Features.TransientDensity);
        Assert.Equal(0, signal.Features.StereoWidth);
        Assert.Equal(0, signal.Features.StereoBalance);
        Assert.All(signal.Features.Waveform, sample => Assert.Equal(0, sample));
    }

    private static AudioSignal AnalyzeStereo(
        Func<int, int, double> source,
        int windowCount = 24,
        double endpointDecibels = 0)
    {
        var analyzer = new AudioAnalyzer();
        var cursor = 0;
        AddStereo(analyzer, ref cursor, FftSize * windowCount, source, endpointDecibels);
        return analyzer.Snapshot(captureActive: true);
    }

    private static void AddStereo(
        AudioAnalyzer analyzer,
        ref int cursor,
        int frameCount,
        Func<int, int, double> source,
        double endpointDecibels = 0)
    {
        var endpointAmplitude = Math.Pow(10, endpointDecibels / 20d);
        var samples = new float[frameCount * Channels];
        for (var localFrame = 0; localFrame < frameCount; localFrame += 1)
        {
            var frame = cursor + localFrame;
            for (var channel = 0; channel < Channels; channel += 1)
            {
                samples[localFrame * Channels + channel] = (float)(source(frame, channel) * endpointAmplitude);
            }
        }
        cursor += frameCount;

        var buffer = new byte[samples.Length * sizeof(float)];
        Buffer.BlockCopy(samples, 0, buffer, 0, buffer.Length);
        var sampleGain = EndpointVolumeCompensation.SampleGainFromEndpointDecibels(endpointDecibels);
        analyzer.AddSamples(buffer, buffer.Length, Format, sampleGain);
    }

    private static double Sine(int frame, double frequency)
    {
        return Math.Sin(2 * Math.PI * frequency * frame / SampleRate);
    }

    private static void AssertBandsComparable(PerceptualAudioBands expected, PerceptualAudioBands actual)
    {
        AssertComparable(expected.SubBass, actual.SubBass, nameof(expected.SubBass));
        AssertComparable(expected.Bass, actual.Bass, nameof(expected.Bass));
        AssertComparable(expected.LowMid, actual.LowMid, nameof(expected.LowMid));
        AssertComparable(expected.Mid, actual.Mid, nameof(expected.Mid));
        AssertComparable(expected.HighMid, actual.HighMid, nameof(expected.HighMid));
        AssertComparable(expected.Presence, actual.Presence, nameof(expected.Presence));
        AssertComparable(expected.Brilliance, actual.Brilliance, nameof(expected.Brilliance));
        AssertComparable(expected.Air, actual.Air, nameof(expected.Air));
    }

    private static void AssertComparable(double expected, double actual, string channel)
    {
        Assert.InRange(Math.Abs(expected - actual), 0, 0.015);
    }
}
