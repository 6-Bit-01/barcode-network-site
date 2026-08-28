using NAudio.Wave;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class AudioAnalyzerAdaptiveResponseTests
{
    private const int SampleRate = 48_000;
    private const int Channels = 2;
    private const int FftSize = 2_048;
    private const int AnalysisHopSize = FftSize / 2;
    private static readonly WaveFormat Format = WaveFormat.CreateIeeeFloatWaveFormat(SampleRate, Channels);

    [Fact]
    public void QuietFadeInProducesUsefulIncreasingVisualLevelsBeforeTheSongIsLoud()
    {
        var analyzer = new AudioAnalyzer();
        AddMusic(analyzer, amplitude: 0, frameCount: FftSize * 4);
        Assert.True(analyzer.Snapshot(captureActive: true).Silence);

        var fadeLevels = new List<double>();
        foreach (var amplitude in new[] { 0.006, 0.012, 0.025, 0.05, 0.1 })
        {
            AddMusic(analyzer, amplitude, frameCount: FftSize);
            var signal = analyzer.Snapshot(captureActive: true);
            fadeLevels.Add(signal.Energy);
        }

        Assert.True(fadeLevels[0] > 0.015, $"the first audible fade step was discarded: {fadeLevels[0]}");
        Assert.True(fadeLevels[1] > fadeLevels[0], "the fade must rise at the second quiet step");
        Assert.True(fadeLevels[2] > fadeLevels[1], "the fade must rise before reaching an ordinary verse level");
        Assert.True(fadeLevels[^1] > fadeLevels[2] + 0.08, "the adaptive lift must preserve real fade dynamics");
        Assert.False(analyzer.Snapshot(captureActive: true).Silence);
    }

    [Fact]
    public void VocalDominantPassageOwnsMidAndTrebleVisualLayers()
    {
        var analyzer = new AudioAnalyzer();
        AddVocal(analyzer, amplitude: 0.32, frameCount: FftSize * 12);

        var signal = analyzer.Snapshot(captureActive: true);

        Assert.False(signal.Silence);
        Assert.True(signal.Energy > 0.12, $"vocal energy was not visible: {signal.Energy}");
        Assert.True(signal.Mid > 0.22, $"vocal mids were not visible: {signal.Mid}");
        Assert.True(signal.Treble > 0.08, $"vocal intelligibility did not reach treble detail: {signal.Treble}");
        Assert.True(signal.Mid > signal.Bass, $"vocal passage lost its mid ownership: bass={signal.Bass}, mid={signal.Mid}");
    }

    [Fact]
    public void OverlappedFftPublishesASecondAnalysisAfterOneHalfWindow()
    {
        var analyzer = new AudioAnalyzer();
        AddMusic(analyzer, amplitude: 0.4, frameCount: FftSize);
        var first = analyzer.Snapshot(captureActive: true);
        Assert.Equal(1L, first.Sequence);

        AddMusic(analyzer, amplitude: 0.4, frameCount: AnalysisHopSize);
        var second = analyzer.Snapshot(captureActive: true);

        Assert.Equal(2L, second.Sequence);
    }

    [Fact]
    public void AdaptiveRangeNeverManufacturesActivityFromDigitalSilence()
    {
        var analyzer = new AudioAnalyzer();
        AddMusic(analyzer, amplitude: 0.7, frameCount: FftSize * 10);
        AddMusic(analyzer, amplitude: 0, frameCount: FftSize * 24);

        var signal = analyzer.Snapshot(captureActive: true);

        Assert.True(signal.Silence);
        Assert.InRange(signal.Energy, 0, 0.01);
        Assert.InRange(signal.Bass, 0, 0.01);
        Assert.InRange(signal.Mid, 0, 0.01);
        Assert.InRange(signal.Treble, 0, 0.01);
        Assert.InRange(signal.Peak, 0, 0.01);
        Assert.Equal(0d, signal.Beat);
    }

    private static void AddMusic(AudioAnalyzer analyzer, double amplitude, int frameCount)
    {
        AddSignal(analyzer, frameCount, frame =>
        {
            var seconds = frame / (double)SampleRate;
            return amplitude * (
                Math.Sin(2 * Math.PI * 80 * seconds) * 0.16
                + Math.Sin(2 * Math.PI * 900 * seconds) * 0.11
                + Math.Sin(2 * Math.PI * 6_000 * seconds) * 0.07);
        });
    }

    private static void AddVocal(AudioAnalyzer analyzer, double amplitude, int frameCount)
    {
        AddSignal(analyzer, frameCount, frame =>
        {
            var seconds = frame / (double)SampleRate;
            var syllable = 0.72 + 0.28 * Math.Sin(2 * Math.PI * 4.2 * seconds);
            return amplitude * syllable * (
                Math.Sin(2 * Math.PI * 180 * seconds) * 0.05
                + Math.Sin(2 * Math.PI * 720 * seconds) * 0.16
                + Math.Sin(2 * Math.PI * 1_450 * seconds) * 0.11
                + Math.Sin(2 * Math.PI * 3_300 * seconds) * 0.07);
        });
    }

    private static void AddSignal(AudioAnalyzer analyzer, int frameCount, Func<int, double> source)
    {
        var samples = new float[frameCount * Channels];
        for (var frame = 0; frame < frameCount; frame += 1)
        {
            var sample = (float)source(frame);
            for (var channel = 0; channel < Channels; channel += 1)
            {
                samples[frame * Channels + channel] = sample;
            }
        }

        var buffer = new byte[samples.Length * sizeof(float)];
        Buffer.BlockCopy(samples, 0, buffer, 0, buffer.Length);
        analyzer.AddSamples(buffer, buffer.Length, Format, EndpointVolumeCompensation.NeutralSampleGain);
    }
}
