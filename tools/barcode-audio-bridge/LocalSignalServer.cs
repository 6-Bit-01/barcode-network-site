using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Barcode.AudioBridge;

internal sealed class LocalSignalServer : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly LoopbackCaptureController _capture;
    private readonly CancellationTokenSource _cancellation = new();
    private TcpListener? _listener;
    private Task? _acceptLoop;

    public LocalSignalServer(LoopbackCaptureController capture)
    {
        _capture = capture;
    }

    public void Start()
    {
        _listener = new TcpListener(IPAddress.Loopback, BridgeConstants.Port);
        _listener.Start(16);
        _acceptLoop = AcceptLoop(_cancellation.Token);
        BridgeLog.Write($"Local visual signal endpoint listening on 127.0.0.1:{BridgeConstants.Port}.");
    }

    private async Task AcceptLoop(CancellationToken cancellationToken)
    {
        if (_listener is null) return;
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                _ = Task.Run(() => HandleClient(client, cancellationToken), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                if (!cancellationToken.IsCancellationRequested) BridgeLog.Write("Local signal endpoint accept failed.", error);
            }
        }
    }

    private async Task HandleClient(TcpClient client, CancellationToken cancellationToken)
    {
        using (client)
        {
            client.NoDelay = true;
            await using var stream = client.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII, false, 1_024, true);
            try
            {
                var requestLine = await reader.ReadLineAsync(cancellationToken);
                if (string.IsNullOrWhiteSpace(requestLine)) return;
                var parts = requestLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 2)
                {
                    await WriteResponse(stream, 400, "text/plain", "Bad Request", null, cancellationToken);
                    return;
                }

                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (var count = 0; count < 64; count += 1)
                {
                    var line = await reader.ReadLineAsync(cancellationToken);
                    if (string.IsNullOrEmpty(line)) break;
                    var colon = line.IndexOf(':');
                    if (colon > 0) headers[line[..colon].Trim()] = line[(colon + 1)..].Trim();
                }

                headers.TryGetValue("Origin", out var origin);
                if (!OriginAllowed(origin))
                {
                    var rejectedOrigin = string.IsNullOrWhiteSpace(origin) ? "(missing)" : origin;
                    _capture.ReportBrowserHandshake("Show Visuals reached the bridge, but its link origin was rejected");
                    BridgeLog.Write($"Rejected visual signal request from origin {rejectedOrigin}.");
                    await WriteResponse(stream, 403, "text/plain", "Forbidden", null, cancellationToken);
                    return;
                }

                var method = parts[0].ToUpperInvariant();
                var path = parts[1].Split('?', 2)[0];
                if (method == "OPTIONS")
                {
                    _capture.ReportBrowserHandshake("Show Visuals found the bridge — waiting for TikTok Studio to finish connecting");
                    await WriteResponse(stream, 204, "text/plain", string.Empty, origin, cancellationToken);
                    return;
                }
                if (method != "GET")
                {
                    await WriteResponse(stream, 405, "text/plain", "Method Not Allowed", origin, cancellationToken);
                    return;
                }
                if (path == "/v1/signal")
                {
                    _capture.TouchClient();
                    var body = JsonSerializer.Serialize(_capture.Snapshot(), JsonOptions);
                    await WriteResponse(stream, 200, "application/json; charset=utf-8", body, origin, cancellationToken);
                    return;
                }
                if (path == "/health")
                {
                    var body = JsonSerializer.Serialize(new { ok = true, captureActive = _capture.CaptureActive, status = _capture.Status }, JsonOptions);
                    await WriteResponse(stream, 200, "application/json; charset=utf-8", body, origin, cancellationToken);
                    return;
                }
                await WriteResponse(stream, 404, "text/plain", "Not Found", origin, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Normal shutdown.
            }
            catch (Exception error)
            {
                BridgeLog.Write("A local visual signal request failed.", error);
            }
        }
    }

    private static bool OriginAllowed(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme == Uri.UriSchemeHttps)
        {
            var host = uri.Host.ToLowerInvariant();
            if (host is "www.barcode-network.com" or "barcode-network.com" or "barcode-network-site-cpps.vercel.app" or "6-bits-projects.vercel.app") return true;
            if (host.EndsWith("-6-bits-projects.vercel.app", StringComparison.Ordinal)) return true;
        }
        return uri.Scheme == Uri.UriSchemeHttp && (uri.Host == "localhost" || IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address));
    }

    private static async Task WriteResponse(
        NetworkStream stream,
        int statusCode,
        string contentType,
        string body,
        string? origin,
        CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        var reason = statusCode switch
        {
            200 => "OK",
            204 => "No Content",
            400 => "Bad Request",
            403 => "Forbidden",
            404 => "Not Found",
            405 => "Method Not Allowed",
            _ => "Error",
        };
        var response = new StringBuilder()
            .Append("HTTP/1.1 ").Append(statusCode).Append(' ').Append(reason).Append("\r\n")
            .Append("Content-Type: ").Append(contentType).Append("\r\n")
            .Append("Content-Length: ").Append(bytes.Length).Append("\r\n")
            .Append("Cache-Control: no-store\r\n")
            .Append("Connection: close\r\n")
            .Append("Access-Control-Allow-Methods: GET, OPTIONS\r\n")
            .Append("Access-Control-Allow-Headers: Content-Type\r\n")
            .Append("Access-Control-Allow-Private-Network: true\r\n")
            .Append("Access-Control-Max-Age: 600\r\n")
            .Append("Private-Network-Access-Name: barcode_audio_bridge\r\n")
            .Append("Private-Network-Access-ID: 02:42:41:52:43:44\r\n")
            .Append("Cross-Origin-Resource-Policy: cross-origin\r\n")
            .Append("Vary: Origin\r\n");
        if (!string.IsNullOrWhiteSpace(origin)) response.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\n");
        response.Append("\r\n");
        var headerBytes = Encoding.ASCII.GetBytes(response.ToString());
        await stream.WriteAsync(headerBytes, cancellationToken);
        if (bytes.Length > 0) await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    public void Dispose()
    {
        _cancellation.Cancel();
        _listener?.Stop();
        try { _acceptLoop?.Wait(TimeSpan.FromSeconds(1)); } catch { }
        _cancellation.Dispose();
    }
}
