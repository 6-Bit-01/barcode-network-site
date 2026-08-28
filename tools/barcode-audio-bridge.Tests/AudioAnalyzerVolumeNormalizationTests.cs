using NAudio.Wave;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class AudioAnalyzerVolumeNormalizationTests
{
    private const int SampleRate = 48_000;
    private const int Channels = 2;
    private const int FftSize = 2_048;
    private static readonly WaveFormat Format = WaveFormat.CreateIeeeFloatWaveFormat(SampleRate, Channels);

    public static TheoryData<double> EndpointAttenuationFixtures => new()
    {
        0,
        -6.0206,
        -12.0412,
        -20,
        -40,
    };

    [Theory]
    [MemberData(nameof(EndpointAttenuationFixtures))]
    public void SameProgramProducesComparableAnalysisAcrossEndpointVolumes(double endpointDecibels)
    {
        var baseline = Analyze(endpointDecibels: 0, amplitude: 1, windowCount: 24);
        var attenuated = Analyze(endpointDecibels, amplitude: 1, windowCount: 24);

        AssertComparable(baseline.Energy, attenuated.Energy, "energy");
        AssertComparable(baseline.Bass, attenuated.Bass, "bass");
        AssertComparable(baseline.Mid, attenuated.Mid, "mid");
        AssertComparable(baseline.Treble, attenuated.Treble, "treble");
        AssertComparable(baseline.Peak, attenuated.Peak, "peak");
        Assert.False(attenuated.Silence);
        Assert.True(attenuated.Bass > attenuated.Mid && attenuated.Mid > attenuated.Treble);
    }

    [Fact]
    public void QuietAndLoudPassagesRetainTheirRealDynamicDifference()
    {
        var analyzer = new AudioAnalyzer();
        AddFixture(analyzer, endpointDecibels: -20, amplitude: 0.25, windowCount: 18);
        var quiet = analyzer.Snapshot(captureActive: true);

        AddFixture(analyzer, endpointDecibels: -20, amplitude: 1, windowCount: 18);
        var loud = analyzer.Snapshot(captureActive: true);

        Assert.True(loud.Energy > quiet.Energy + 0.20, $"energy did not retain dynamics: {quiet.Energy} -> {loud.Energy}");
        Assert.True(loud.Bass > quiet.Bass + 0.15, $"bass did not retain dynamics: {quiet.Bass} -> {loud.Bass}");
        Assert.True(loud.Mid > quiet.Mid + 0.15, $"mid did not retain dynamics: {quiet.Mid} -> {loud.Mid}");
        Assert.True(loud.Treble > quiet.Treble + 0.10, $"treble did not retain dynamics: {quiet.Treble} -> {loud.Treble}");
        Assert.True(loud.Peak > quiet.Peak + 0.07, $"peak did not retain dynamics: {quiet.Peak} -> {loud.Peak}");
    }

    [Fact]
    public void AdaptiveVisualResponseMakesFullScaleProgramStrongWithoutFlatteningEveryChannel()
    {
        var signal = Analyze(endpointDecibels: 0, amplitude: 1, windowCount: 24);

        Assert.InRange(signal.Energy, 0.55, 1);
        Assert.InRange(signal.Bass, 0.5, 1);
        Assert.InRange(signal.Mid, 0.4, 1);
        Assert.InRange(signal.Treble, 0.3, 1);
        Assert.InRange(signal.Peak, 0.15, 0.85);
        Assert.True(signal.Bass > signal.Mid + 0.12,
            $"shared gain flattened bass and mids: bass={signal.Bass}, mid={signal.Mid}");
        Assert.True(signal.Mid > signal.Treble + 0.08,
            $"shared gain flattened mids and treble: mid={signal.Mid}, treble={signal.Treble}");
    }

    [Fact]
    public void DigitalSilenceRemainsSilenceAtHighCompensation()
    {
        var signal = Analyze(endpointDecibels: -40, amplitude: 0, windowCount: 24);

        Assert.True(signal.WarmedUp);
        Assert.True(signal.Silence);
        Assert.InRange(signal.Energy, 0, 0.01);
        Assert.InRange(signal.Bass, 0, 0.01);
        Assert.InRange(signal.Mid, 0, 0.01);
        Assert.InRange(signal.Treble, 0, 0.01);
        Assert.InRange(signal.Peak, 0, 0.01);
        Assert.Equal(0d, signal.Beat);
    }

    [Fact]
    public void MissingOrInvalidEndpointVolumeUsesNeutralGain()
    {
        Assert.Equal(EndpointVolumeCompensation.NeutralSampleGain,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(null));
        Assert.Equal(EndpointVolumeCompensation.NeutralSampleGain,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(double.NaN));
        Assert.Equal(EndpointVolumeCompensation.NeutralSampleGain,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(double.PositiveInfinity));
        Assert.Equal(EndpointVolumeCompensation.NeutralSampleGain,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(-121));
        Assert.Equal(EndpointVolumeCompensation.NeutralSampleGain,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(25));
        Assert.Equal(100d,
            EndpointVolumeCompensation.SampleGainFromEndpointDecibels(-80));

        var explicitNeutral = Analyze(endpointDecibels: 0, amplitude: 1, windowCount: 24);
        var fallback = AnalyzeWithGain(EndpointVolumeCompensation.SampleGainFromEndpointDecibels(null), amplitude: 1, windowCount: 24);
        AssertComparable(explicitNeutral.Energy, fallback.Energy, "fallback energy");
        AssertComparable(explicitNeutral.Bass, fallback.Bass, "fallback bass");
        AssertComparable(explicitNeutral.Mid, fallback.Mid, "fallback mid");
        AssertComparable(explicitNeutral.Treble, fallback.Treble, "fallback treble");
        AssertComparable(explicitNeutral.Peak, fallback.Peak, "fallback peak");
    }

    [Theory]
    [MemberData(nameof(EndpointAttenuationFixtures))]
    public void DecibelGainReconstructsTheOriginalSample(double endpointDecibels)
    {
        const double originalSample = 0.42;
        var endpointAmplitude = Math.Pow(10, endpointDecibels / 20d);
        var capturedSample = originalSample * endpointAmplitude;
        var sampleGain = EndpointVolumeCompensation.SampleGainFromEndpointDecibels(endpointDecibels);

        var reconstructed = EndpointVolumeCompensation.Apply(capturedSample, sampleGain);

        Assert.InRange(Math.Abs(originalSample - reconstructed), 0, 0.000001);
    }

    [Theory]
    [MemberData(nameof(EndpointAttenuationFixtures))]
    public void FixedAnalysisReferenceFollowsVolumeReconstruction(double endpointDecibels)
    {
        const double originalSample = 0.42;
        var endpointAmplitude = Math.Pow(10, endpointDecibels / 20d);
        var capturedSample = originalSample * endpointAmplitude;
        var sampleGain = EndpointVolumeCompensation.SampleGainFromEndpointDecibels(endpointDecibels);

        var analyzed = EndpointVolumeCompensation.ApplyForAnalysis(capturedSample, sampleGain);
        var expected = originalSample * EndpointVolumeCompensation.AnalysisReferenceGain;

        Assert.InRange(Math.Abs(expected - analyzed), 0, 0.000001);
    }

    private static AudioSignal Analyze(double endpointDecibels, double amplitude, int windowCount)
    {
        var analyzer = new AudioAnalyzer();
        AddFixture(analyzer, endpointDecibels, amplitude, windowCount);
        return analyzer.Snapshot(captureActive: true);
    }

    private static AudioSignal AnalyzeWithGain(double sampleGain, double amplitude, int windowCount)
    {
        var analyzer = new AudioAnalyzer();
        var buffer = BuildSignal(endpointDecibels: 0, amplitude, windowCount);
        analyzer.AddSamples(buffer, buffer.Length, Format, sampleGain);
        return analyzer.Snapshot(captureActive: true);
    }

    private static void AddFixture(AudioAnalyzer analyzer, double endpointDecibels, double amplitude, int windowCount)
    {
        var buffer = BuildSignal(endpointDecibels, amplitude, windowCount);
        var sampleGain = EndpointVolumeCompensation.SampleGainFromEndpointDecibels(endpointDecibels);
        analyzer.AddSamples(buffer, buffer.Length, Format, sampleGain);
    }

    private static byte[] BuildSignal(double endpointDecibels, double amplitude, int windowCount)
    {
        var endpointAmplitude = Math.Pow(10, endpointDecibels / 20d);
        var frameCount = FftSize * windowCount;
        var samples = new float[frameCount * Channels];
        for (var frame = 0; frame < frameCount; frame += 1)
        {
            var seconds = frame / (double)SampleRate;
            var source = amplitude * (
                Math.Sin(2 * Math.PI * 80 * seconds) * 0.16
                + Math.Sin(2 * Math.PI * 900 * seconds) * 0.11
                + Math.Sin(2 * Math.PI * 6_000 * seconds) * 0.07);
            var captured = (float)(source * endpointAmplitude);
            for (var channel = 0; channel < Channels; channel += 1)
            {
                samples[frame * Channels + channel] = captured;
            }
        }

        var buffer = new byte[samples.Length * sizeof(float)];
        Buffer.BlockCopy(samples, 0, buffer, 0, buffer.Length);
        return buffer;
    }

    private static void AssertComparable(double expected, double actual, string channel)
    {
        var difference = Math.Abs(expected - actual);
        Assert.True(
            difference <= 0.015,
            $"{channel} changed by {difference}; expected {expected}, actual {actual}");
    }
}
