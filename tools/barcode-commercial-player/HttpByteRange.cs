using System.Globalization;

namespace Barcode.AudioBridge;

internal readonly record struct HttpByteRangeSelection(
    bool Requested,
    bool Satisfiable,
    long Start,
    long End)
{
    public long Length => Satisfiable ? End - Start + 1 : 0;

    public static HttpByteRangeSelection Parse(string? header, long contentLength)
    {
        if (contentLength <= 0)
        {
            return new HttpByteRangeSelection(!string.IsNullOrWhiteSpace(header), false, 0, -1);
        }

        if (string.IsNullOrWhiteSpace(header))
        {
            return new HttpByteRangeSelection(false, true, 0, contentLength - 1);
        }

        var value = header.Trim();
        if (!value.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase) || value.Contains(','))
        {
            return new HttpByteRangeSelection(true, false, 0, -1);
        }

        var range = value[6..].Trim();
        var dash = range.IndexOf('-');
        if (dash < 0)
        {
            return new HttpByteRangeSelection(true, false, 0, -1);
        }

        var startText = range[..dash].Trim();
        var endText = range[(dash + 1)..].Trim();
        if (startText.Length == 0)
        {
            if (!long.TryParse(endText, NumberStyles.None, CultureInfo.InvariantCulture, out var suffixLength)
                || suffixLength <= 0)
            {
                return new HttpByteRangeSelection(true, false, 0, -1);
            }

            suffixLength = Math.Min(suffixLength, contentLength);
            return new HttpByteRangeSelection(true, true, contentLength - suffixLength, contentLength - 1);
        }

        if (!long.TryParse(startText, NumberStyles.None, CultureInfo.InvariantCulture, out var start)
            || start < 0
            || start >= contentLength)
        {
            return new HttpByteRangeSelection(true, false, 0, -1);
        }

        var end = contentLength - 1;
        if (endText.Length > 0
            && (!long.TryParse(endText, NumberStyles.None, CultureInfo.InvariantCulture, out end)
                || end < start))
        {
            return new HttpByteRangeSelection(true, false, 0, -1);
        }

        end = Math.Min(end, contentLength - 1);
        return new HttpByteRangeSelection(true, true, start, end);
    }
}
