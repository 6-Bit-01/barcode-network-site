using System.Buffers;
using System.Globalization;
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
    private readonly CommercialBreakService _commercials;
    private readonly CancellationTokenSource _cancellation = new();
    private TcpListener? _listener;
    private Task? _acceptLoop;

    public LocalSignalServer(LoopbackCaptureController capture, CommercialBreakService commercials)
    {
        ArgumentNullException.ThrowIfNull(capture);
        ArgumentNullException.ThrowIfNull(commercials);
        _capture = capture;
        _commercials = commercials;
    }

    public void Start()
    {
        _listener = new TcpListener(IPAddress.Loopback, BridgeConstants.Port);
        _listener.Start(16);
        _acceptLoop = AcceptLoop(_cancellation.Token);
        BridgeLog.Write($"Local show helper endpoint listening on 127.0.0.1:{BridgeConstants.Port}.");
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
                if (!cancellationToken.IsCancellationRequested)
                {
                    BridgeLog.Write("Local show helper endpoint accept failed.", error);
                }
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
                if (parts.Length < 2
                    || !Uri.TryCreate($"http://127.0.0.1{parts[1]}", UriKind.Absolute, out var requestUri))
                {
                    await WriteTextResponse(stream, 400, "text/plain", "Bad Request", null, cancellationToken);
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

                var method = parts[0].ToUpperInvariant();
                var path = requestUri.AbsolutePath;
                headers.TryGetValue("Origin", out var origin);
                var isCommercialRoute = path.Equals("/commercials", StringComparison.OrdinalIgnoreCase)
                    || path.Equals("/commercials/", StringComparison.OrdinalIgnoreCase)
                    || path.StartsWith("/v1/commercials/", StringComparison.OrdinalIgnoreCase);
                var originAllowed = isCommercialRoute
                    ? CommercialOriginAllowed(origin)
                    : VisualOriginAllowed(origin);
                if (!originAllowed)
                {
                    var rejectedOrigin = string.IsNullOrWhiteSpace(origin) ? "(missing)" : origin;
                    if (!isCommercialRoute)
                    {
                        _capture.ReportBrowserHandshake("Show Visuals reached the bridge, but its link origin was rejected");
                    }
                    BridgeLog.Write($"Rejected local helper request path={path} origin={rejectedOrigin}.");
                    await WriteTextResponse(stream, 403, "text/plain", "Forbidden", null, cancellationToken);
                    return;
                }

                if (method == "OPTIONS")
                {
                    if (!isCommercialRoute)
                    {
                        _capture.ReportBrowserHandshake("Show Visuals found the bridge — waiting for TikTok Studio to finish connecting");
                    }
                    await WriteTextResponse(stream, 204, "text/plain", string.Empty, origin, cancellationToken);
                    return;
                }

                if (path == "/v1/signal" && method == "GET")
                {
                    _capture.TouchClient();
                    var body = JsonSerializer.Serialize(_capture.Snapshot(), JsonOptions);
                    await WriteTextResponse(stream, 200, "application/json; charset=utf-8", body, origin, cancellationToken);
                    return;
                }

                if (path == "/health" && method == "GET")
                {
                    var body = JsonSerializer.Serialize(new
                    {
                        ok = true,
                        captureActive = _capture.CaptureActive,
                        captureStatus = _capture.Status,
                        commercialStatus = _commercials.Snapshot().Status,
                    }, JsonOptions);
                    await WriteTextResponse(stream, 200, "application/json; charset=utf-8", body, origin, cancellationToken);
                    return;
                }

                if ((path.Equals("/commercials", StringComparison.OrdinalIgnoreCase)
                        || path.Equals("/commercials/", StringComparison.OrdinalIgnoreCase))
                    && method == "GET")
                {
                    var securityHeaders = new Dictionary<string, string>
                    {
                        ["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'; media-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'",
                        ["X-Content-Type-Options"] = "nosniff",
                    };
                    await WriteTextResponse(
                        stream,
                        200,
                        "text/html; charset=utf-8",
                        CommercialPlayerPage.Html,
                        origin,
                        cancellationToken,
                        securityHeaders);
                    return;
                }

                if (path == "/v1/commercials/state" && method == "GET")
                {
                    var body = JsonSerializer.Serialize(_commercials.Snapshot(playerHeartbeat: true), JsonOptions);
                    await WriteTextResponse(stream, 200, "application/json; charset=utf-8", body, origin, cancellationToken);
                    return;
                }

                const string mediaPrefix = "/v1/commercials/media/";
                if (path.StartsWith(mediaPrefix, StringComparison.OrdinalIgnoreCase)
                    && method is "GET" or "HEAD")
                {
                    var id = path[mediaPrefix.Length..];
                    if (id.Length is < 8 or > 64 || !_commercials.TryGetMedia(id, out var media))
                    {
                        await WriteTextResponse(stream, 404, "text/plain", "Not Found", origin, cancellationToken);
                        return;
                    }
                    headers.TryGetValue("Range", out var range);
                    await WriteFileResponse(
                        stream,
                        media.FilePath,
                        media.ContentType,
                        range,
                        method == "HEAD",
                        origin,
                        cancellationToken);
                    return;
                }

                if (path == "/v1/commercials/clip-started" && method == "POST")
                {
                    var accepted = TryGetLong(requestUri, "generation", out var generation)
                        && TryGetInt(requestUri, "index", out var index)
                        && _commercials.MarkClipStarted(generation, index);
                    await WriteJsonResult(stream, accepted, origin, cancellationToken);
                    return;
                }

                if (path == "/v1/commercials/complete" && method == "POST")
                {
                    var accepted = TryGetLong(requestUri, "generation", out var generation)
                        && _commercials.MarkCompleted(generation);
                    await WriteJsonResult(stream, accepted, origin, cancellationToken);
                    return;
                }

                if (path == "/v1/commercials/failed" && method == "POST")
                {
                    var reason = GetQueryValue(requestUri, "reason");
                    if (reason is not null)
                    {
                        reason = new string(reason.Where(character => !char.IsControl(character)).ToArray()).Trim();
                        if (reason.Length > 180) reason = reason[..180];
                    }
                    var accepted = TryGetLong(requestUri, "generation", out var generation)
                        && _commercials.MarkFailed(generation, reason);
                    await WriteJsonResult(stream, accepted, origin, cancellationToken);
                    return;
                }

                if (method is not "GET" and not "HEAD" and not "POST")
                {
                    await WriteTextResponse(stream, 405, "text/plain", "Method Not Allowed", origin, cancellationToken);
                    return;
                }

                await WriteTextResponse(stream, 404, "text/plain", "Not Found", origin, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Normal shutdown.
            }
            catch (Exception error)
            {
                BridgeLog.Write("A local show helper request failed.", error);
            }
        }
    }

    private static async Task WriteJsonResult(
        NetworkStream stream,
        bool accepted,
        string? origin,
        CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new { ok = accepted }, JsonOptions);
        await WriteTextResponse(
            stream,
            accepted ? 200 : 409,
            "application/json; charset=utf-8",
            body,
            origin,
            cancellationToken);
    }

    private static bool VisualOriginAllowed(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme == Uri.UriSchemeHttps)
        {
            var host = uri.Host.ToLowerInvariant();
            if (host is "www.barcode-network.com" or "barcode-network.com" or "barcode-network-site-cpps.vercel.app" or "6-bits-projects.vercel.app") return true;
            if (host.EndsWith("-6-bits-projects.vercel.app", StringComparison.Ordinal)) return true;
        }
        return IsLocalHttpOrigin(uri);
    }

    private static bool CommercialOriginAllowed(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return true;
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri) && IsLocalHttpOrigin(uri);
    }

    private static bool IsLocalHttpOrigin(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttp
        && (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address));

    private static bool TryGetLong(Uri uri, string name, out long value) =>
        long.TryParse(GetQueryValue(uri, name), NumberStyles.None, CultureInfo.InvariantCulture, out value);

    private static bool TryGetInt(Uri uri, string name, out int value) =>
        int.TryParse(GetQueryValue(uri, name), NumberStyles.None, CultureInfo.InvariantCulture, out value);

    private static string? GetQueryValue(Uri uri, string name)
    {
        var query = uri.Query.TrimStart('?');
        if (query.Length == 0) return null;
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            var rawName = separator < 0 ? pair : pair[..separator];
            if (!string.Equals(Uri.UnescapeDataString(rawName), name, StringComparison.OrdinalIgnoreCase)) continue;
            var rawValue = separator < 0 ? string.Empty : pair[(separator + 1)..];
            return Uri.UnescapeDataString(rawValue.Replace('+', ' '));
        }
        return null;
    }

    private static async Task WriteFileResponse(
        NetworkStream stream,
        string filePath,
        string contentType,
        string? rangeHeader,
        bool headOnly,
        string? origin,
        CancellationToken cancellationToken)
    {
        await using var file = new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            64 * 1_024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        var selection = HttpByteRangeSelection.Parse(rangeHeader, file.Length);
        if (!selection.Satisfiable)
        {
            await WriteHeader(
                stream,
                416,
                "text/plain",
                0,
                origin,
                "no-store",
                new Dictionary<string, string>
                {
                    ["Accept-Ranges"] = "bytes",
                    ["Content-Range"] = $"bytes */{file.Length}",
                },
                cancellationToken);
            await stream.FlushAsync(cancellationToken);
            return;
        }

        var statusCode = selection.Requested ? 206 : 200;
        var extraHeaders = new Dictionary<string, string>
        {
            ["Accept-Ranges"] = "bytes",
            ["X-Content-Type-Options"] = "nosniff",
        };
        if (selection.Requested)
        {
            extraHeaders["Content-Range"] = $"bytes {selection.Start}-{selection.End}/{file.Length}";
        }
        await WriteHeader(
            stream,
            statusCode,
            contentType,
            selection.Length,
            origin,
            "private, max-age=60",
            extraHeaders,
            cancellationToken);
        if (headOnly)
        {
            await stream.FlushAsync(cancellationToken);
            return;
        }

        file.Position = selection.Start;
        var remaining = selection.Length;
        var buffer = ArrayPool<byte>.Shared.Rent(64 * 1_024);
        try
        {
            while (remaining > 0)
            {
                var requested = (int)Math.Min(buffer.Length, remaining);
                var read = await file.ReadAsync(buffer.AsMemory(0, requested), cancellationToken);
                if (read <= 0) break;
                await stream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                remaining -= read;
            }
            await stream.FlushAsync(cancellationToken);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private static async Task WriteTextResponse(
        NetworkStream stream,
        int statusCode,
        string contentType,
        string body,
        string? origin,
        CancellationToken cancellationToken,
        IReadOnlyDictionary<string, string>? extraHeaders = null)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        await WriteHeader(
            stream,
            statusCode,
            contentType,
            bytes.Length,
            origin,
            "no-store",
            extraHeaders,
            cancellationToken);
        if (bytes.Length > 0) await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private static async Task WriteHeader(
        NetworkStream stream,
        int statusCode,
        string contentType,
        long contentLength,
        string? origin,
        string cacheControl,
        IReadOnlyDictionary<string, string>? extraHeaders,
        CancellationToken cancellationToken)
    {
        var reason = statusCode switch
        {
            200 => "OK",
            204 => "No Content",
            206 => "Partial Content",
            400 => "Bad Request",
            403 => "Forbidden",
            404 => "Not Found",
            405 => "Method Not Allowed",
            409 => "Conflict",
            416 => "Range Not Satisfiable",
            _ => "Error",
        };
        var response = new StringBuilder()
            .Append("HTTP/1.1 ").Append(statusCode).Append(' ').Append(reason).Append("\r\n")
            .Append("Content-Type: ").Append(contentType).Append("\r\n")
            .Append("Content-Length: ").Append(contentLength.ToString(CultureInfo.InvariantCulture)).Append("\r\n")
            .Append("Cache-Control: ").Append(cacheControl).Append("\r\n")
            .Append("Connection: close\r\n")
            .Append("Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n")
            .Append("Access-Control-Allow-Headers: Content-Type, Range\r\n")
            .Append("Access-Control-Allow-Private-Network: true\r\n")
            .Append("Access-Control-Max-Age: 600\r\n")
            .Append("Private-Network-Access-Name: barcode_audio_bridge\r\n")
            .Append("Private-Network-Access-ID: 02:42:41:52:43:44\r\n")
            .Append("Cross-Origin-Resource-Policy: cross-origin\r\n")
            .Append("Vary: Origin, Range\r\n");
        if (!string.IsNullOrWhiteSpace(origin))
        {
            response.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\n");
        }
        if (extraHeaders is not null)
        {
            foreach (var header in extraHeaders)
            {
                response.Append(header.Key).Append(": ").Append(header.Value).Append("\r\n");
            }
        }
        response.Append("\r\n");
        var headerBytes = Encoding.ASCII.GetBytes(response.ToString());
        await stream.WriteAsync(headerBytes, cancellationToken);
    }

    public void Dispose()
    {
        _cancellation.Cancel();
        _listener?.Stop();
        try { _acceptLoop?.Wait(TimeSpan.FromSeconds(1)); } catch { }
        _cancellation.Dispose();
    }
}
