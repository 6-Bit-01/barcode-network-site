using System.Net.Sockets;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class LocalSignalServerTests
{
    [Theory]
    [InlineData(SocketError.ConnectionAborted)]
    [InlineData(SocketError.ConnectionReset)]
    [InlineData(SocketError.OperationAborted)]
    [InlineData(SocketError.Shutdown)]
    public void BrowserMediaDisconnectsAreExpectedCancellations(SocketError socketError)
    {
        var error = new IOException(
            "browser closed a buffered range response",
            new SocketException((int)socketError));

        Assert.True(LocalSignalServer.IsExpectedClientDisconnect(error));
    }

    [Fact]
    public void UnrelatedRequestErrorsRemainDiagnosticFailures()
    {
        Assert.False(LocalSignalServer.IsExpectedClientDisconnect(new InvalidDataException("bad request")));
    }
}
