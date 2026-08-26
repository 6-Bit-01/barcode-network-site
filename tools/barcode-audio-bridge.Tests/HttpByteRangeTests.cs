using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class HttpByteRangeTests
{
    [Fact]
    public void MissingRangeSelectsTheWholeFile()
    {
        var result = HttpByteRangeSelection.Parse(null, 1_000);

        Assert.False(result.Requested);
        Assert.True(result.Satisfiable);
        Assert.Equal(0, result.Start);
        Assert.Equal(999, result.End);
        Assert.Equal(1_000, result.Length);
    }

    [Theory]
    [InlineData("bytes=100-199", 100, 199, 100)]
    [InlineData("bytes=900-", 900, 999, 100)]
    [InlineData("bytes=-250", 750, 999, 250)]
    [InlineData("bytes=0-9999", 0, 999, 1000)]
    public void ValidSingleRangesAreBoundedToTheFile(
        string header,
        long expectedStart,
        long expectedEnd,
        long expectedLength)
    {
        var result = HttpByteRangeSelection.Parse(header, 1_000);

        Assert.True(result.Requested);
        Assert.True(result.Satisfiable);
        Assert.Equal(expectedStart, result.Start);
        Assert.Equal(expectedEnd, result.End);
        Assert.Equal(expectedLength, result.Length);
    }

    [Theory]
    [InlineData("items=0-10")]
    [InlineData("bytes=1000-")]
    [InlineData("bytes=200-100")]
    [InlineData("bytes=0-1,4-5")]
    [InlineData("bytes=-0")]
    [InlineData("bytes=-")]
    public void InvalidOrUnsatisfiableRangesFailClosed(string header)
    {
        var result = HttpByteRangeSelection.Parse(header, 1_000);

        Assert.True(result.Requested);
        Assert.False(result.Satisfiable);
        Assert.Equal(0, result.Length);
    }
}
