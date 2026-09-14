using System.Net.Sockets;
using System.Net;
using System.Text.Json;
using Xunit;

namespace Barcode.AudioBridge.Tests;

public sealed class CommercialPlayerServerTests
{
    [Fact]
    public async Task SavedMediaAndClipStartCannotBypassActiveEligibility()
    {
        using var fixture = new TemporaryCommercialLibrary();
        foreach (var name in new[] { "ForbesFiberLOW.mp4", "NovaCordova.mp4", "c.mp4", "d.mp4" }) fixture.AddActiveSponsor(name);
        var service = new CommercialBreakService(new CommercialBreakLibrary(fixture.RootDirectory, new TestDurationReader()));
        using var server = new CommercialPlayerServer(service);
        server.Start();
        using var client = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:43121"), Timeout = TimeSpan.FromSeconds(10) };
        Assert.True(service.Start().Started);
        var state = service.Snapshot();
        var index = state.Items.ToList().FindIndex(item => item.Name == "ForbesFiberLOW");
        var item = state.Items[index];
        using var playable = await client.GetAsync(item.Url);
        Assert.Equal(HttpStatusCode.OK, playable.StatusCode);
        Assert.True(playable.Headers.CacheControl!.NoStore);
        File.Move(Path.Combine(fixture.ActiveDirectory, "ForbesFiberLOW.mp4"), Path.Combine(fixture.InactiveDirectory, "ForbesFiberLOW.mp4"));
        using var revoked = await client.GetAsync(item.Url);
        Assert.Equal(HttpStatusCode.NotFound, revoked.StatusCode);
        using var skip = await client.PostAsync($"/v1/commercials/clip-started?generation={state.Generation}&index={index}", null);
        Assert.Equal(HttpStatusCode.OK, skip.StatusCode);
        using var body = JsonDocument.Parse(await skip.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("skipped").GetBoolean());
        Assert.Equal("queued", service.Snapshot().Status);
        using var remaining = await client.GetAsync(state.Items.Single(entry => entry.Name == "NovaCordova").Url);
        Assert.Equal(HttpStatusCode.OK, remaining.StatusCode);
        service.Stop();
    }

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
