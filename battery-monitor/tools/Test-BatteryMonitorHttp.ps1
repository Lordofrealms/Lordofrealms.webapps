param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [ValidateRange(1, 86400)]
    [int]$DurationSec = 60,

    [ValidateRange(1, 20)]
    [int]$Concurrency = 1,

    [ValidateRange(0, 60000)]
    [int]$IntervalMs = 1000,

    [ValidateRange(1, 60)]
    [int]$TimeoutSec = 5,

    [ValidateRange(1, 60000)]
    [double]$FailLatencyMs = 2000,

    [string]$CsvPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$base = $BaseUrl.Trim().TrimEnd('/')
if ($base -notmatch '^https?://') {
    $base = "http://$base"
}

$statusUri = "$base/api/status"
$runtimeUri = "$base/api/runtime"

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)

$results = New-Object 'System.Collections.Generic.List[object]'
$deadline = [DateTime]::UtcNow.AddSeconds($DurationSec)
$batch = 0

function Get-Percentile([double[]]$SortedValues, [double]$Percent) {
    if ($SortedValues.Count -eq 0) { return [double]::NaN }
    $index = [Math]::Ceiling(($Percent / 100.0) * $SortedValues.Count) - 1
    if ($index -lt 0) { $index = 0 }
    if ($index -ge $SortedValues.Count) { $index = $SortedValues.Count - 1 }
    return $SortedValues[$index]
}

function Get-RuntimeSnapshot([string]$Label) {
    try {
        $text = $client.GetStringAsync($runtimeUri).GetAwaiter().GetResult()
        Write-Host "[$Label] /api/runtime: $text"
    }
    catch {
        Write-Warning "[$Label] Could not read /api/runtime: $($_.Exception.Message)"
    }
}

Write-Host "Battery Monitor HTTP responsiveness probe"
Write-Host "Target:       $base"
Write-Host "Duration:     $DurationSec s"
Write-Host "Concurrency:  $Concurrency"
Write-Host "Batch delay:  $IntervalMs ms"
Write-Host "HTTP timeout: $TimeoutSec s"
Write-Host "Fail latency: $FailLatencyMs ms"
Write-Host ""
Get-RuntimeSnapshot "START"

try {
    while ([DateTime]::UtcNow -lt $deadline) {
        $batch++
        $pending = @()

        for ($worker = 1; $worker -le $Concurrency; $worker++) {
            $watch = [System.Diagnostics.Stopwatch]::StartNew()
            $started = [DateTime]::UtcNow
            try {
                $task = $client.GetAsync($statusUri)
                $pending += [PSCustomObject]@{
                    Batch = $batch
                    Worker = $worker
                    StartedUtc = $started
                    Watch = $watch
                    Task = $task
                    LaunchError = $null
                }
            }
            catch {
                $watch.Stop()
                $pending += [PSCustomObject]@{
                    Batch = $batch
                    Worker = $worker
                    StartedUtc = $started
                    Watch = $watch
                    Task = $null
                    LaunchError = $_.Exception.Message
                }
            }
        }

        foreach ($item in $pending) {
            $statusCode = 0
            $ok = $false
            $errorText = $item.LaunchError
            $response = $null

            if ($null -ne $item.Task) {
                try {
                    $response = $item.Task.GetAwaiter().GetResult()
                    $null = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                    $statusCode = [int]$response.StatusCode
                    $ok = $response.IsSuccessStatusCode
                    if (-not $ok) { $errorText = "HTTP $statusCode" }
                }
                catch {
                    $errorText = $_.Exception.Message
                }
                finally {
                    if ($null -ne $response) { $response.Dispose() }
                }
            }

            $item.Watch.Stop()
            $results.Add([PSCustomObject]@{
                TimestampUtc = $item.StartedUtc.ToString("o")
                Batch = $item.Batch
                Worker = $item.Worker
                Ok = $ok
                StatusCode = $statusCode
                LatencyMs = [Math]::Round($item.Watch.Elapsed.TotalMilliseconds, 3)
                Error = if ($null -eq $errorText) { "" } else { $errorText }
            })
        }

        if ($IntervalMs -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds $IntervalMs
        }
    }
}
finally {
    Get-RuntimeSnapshot "END"
    $client.Dispose()
    $handler.Dispose()
}

if ($CsvPath) {
    $parent = Split-Path -Parent $CsvPath
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $results | Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
    Write-Host "CSV:          $CsvPath"
}

$success = @($results | Where-Object { $_.Ok })
$failed = @($results | Where-Object { -not $_.Ok })
$latencies = @($success | ForEach-Object { [double]$_.LatencyMs } | Sort-Object)
$over250 = @($success | Where-Object { $_.LatencyMs -ge 250 }).Count
$over1000 = @($success | Where-Object { $_.LatencyMs -ge 1000 }).Count
$overFail = @($success | Where-Object { $_.LatencyMs -ge $FailLatencyMs }).Count

Write-Host ""
Write-Host "Requests:     $($results.Count)"
Write-Host "Successful:   $($success.Count)"
Write-Host "Failed:       $($failed.Count)"

if ($latencies.Count -gt 0) {
    $average = ($latencies | Measure-Object -Average).Average
    $summary = "Latency ms:   min={0:N1} avg={1:N1} p50={2:N1} p95={3:N1} p99={4:N1} max={5:N1}" -f $latencies[0], $average, (Get-Percentile $latencies 50), (Get-Percentile $latencies 95), (Get-Percentile $latencies 99), $latencies[-1]
    Write-Host $summary
    Write-Host "Latency bins: >=250ms=$over250  >=1000ms=$over1000  >=${FailLatencyMs}ms=$overFail"
}

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failures:" -ForegroundColor Yellow
    $failed | Select-Object -First 20 TimestampUtc, Batch, Worker, LatencyMs, Error | Format-Table -AutoSize
    if ($failed.Count -gt 20) { Write-Host "... $($failed.Count - 20) additional failure(s) in CSV/results." }
}

if ($success.Count -eq 0 -or $failed.Count -gt 0 -or $overFail -gt 0) {
    Write-Host "RESULT: FAIL" -ForegroundColor Red
    exit 2
}

Write-Host "RESULT: PASS" -ForegroundColor Green
exit 0
