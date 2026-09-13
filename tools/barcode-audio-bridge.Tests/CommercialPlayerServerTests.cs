using System.Net.Sockets;
using System.Net;
using System.Text.Json;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerServerTests
{
    [Fact]
    public async Task QueuePreflightUsesTheRealServiceAndApprovedOriginsWithoutFakingAPlayerHeartbeat()
    {
        using var fixture = new TemporaryCommercialLibrary();
        foreach (var name in new[] { "eligible-a.mp4", "eligible-b.mp4", "eligible-c.mp4", "eligible-d.mp4" }) fixture.AddActiveSponsor(name);
        fixture.AddInactiveSponsor("inactive.mp4");
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()));
        using var server = new CommercialPlayerServer(service);
        server.Start();
        using var client = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:43121"), Timeout = TimeSpan.FromSeconds(10) };
        client.DefaultRequestHeaders.Add("Origin", "https://www.barcode-network.com");
        using var disconnected = await client.GetAsync("/v1/commercials/preflight");
        Assert.Equal(HttpStatusCode.Conflict, disconnected.StatusCode);
        using var missing = JsonDocument.Parse(await disconnected.Content.ReadAsStringAsync());
        Assert.False(missing.RootElement.GetProperty("playerConnected").GetBoolean());
        Assert.Equal("idle", service.Snapshot().Status);

        service.Snapshot(playerHeartbeat: true);
        using var ready = await client.GetAsync("/v1/commercials/preflight");
        using var body = JsonDocument.Parse(await ready.Content.ReadAsStringAsync());
        Assert.True(ready.IsSuccessStatusCode, body.RootElement.GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal("barcode_commercial_start_v1", body.RootElement.GetProperty("protocol").GetString());
        Assert.True(body.RootElement.GetProperty("ready").GetBoolean());
        Assert.Equal(new[] { "eligible-a.mp4", "eligible-b.mp4", "eligible-c.mp4", "eligible-d.mp4" }, body.RootElement.GetProperty("activeFileNames").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(0, service.Snapshot().Generation);

        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "https://unrelated.example");
        using var rejected = await client.GetAsync("/v1/commercials/preflight");
        Assert.Equal(HttpStatusCode.Forbidden, rejected.StatusCode);
        Assert.Equal("idle", service.Snapshot().Status);
    }

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

        Assert.True(CommercialPlayerServer.IsExpectedClientDisconnect(error));
    }

    [Fact]
    public void UnrelatedRequestErrorsRemainDiagnosticFailures()
    {
        Assert.False(CommercialPlayerServer.IsExpectedClientDisconnect(new InvalidDataException("bad request")));
    }
}
