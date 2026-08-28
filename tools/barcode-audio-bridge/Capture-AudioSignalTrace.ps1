[CmdletBinding()]
param(
    [ValidateRange(5, 900)]
    [int]$Seconds = 120,

    [ValidateRange(20, 1_000)]
    [int]$PollMilliseconds = 25,

    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path (Get-Location) "radio-$stamp.barcode-audio-trace.ndjson"
}

$fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($fullOutputPath)
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
$writer = [System.IO.StreamWriter]::new($fullOutputPath, $false, $utf8WithoutBom)
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$frameCount = 0
$lastSequence = -1

try {
    while ($stopwatch.Elapsed.TotalSeconds -lt $Seconds) {
        $signal = Invoke-RestMethod `
            -Uri "http://127.0.0.1:43120/v1/signal" `
            -Method Get `
            -TimeoutSec 2

        if ($null -ne $signal.sequence -and [long]$signal.sequence -ne $lastSequence) {
            $writer.WriteLine(($signal | ConvertTo-Json -Compress -Depth 12))
            $lastSequence = [long]$signal.sequence
            $frameCount += 1
        }

        Start-Sleep -Milliseconds $PollMilliseconds
    }
}
finally {
    $writer.Dispose()
}

Write-Host "Captured $frameCount numeric signal frames."
Write-Host "Trace: $fullOutputPath"
Write-Host "No audio samples were recorded."
