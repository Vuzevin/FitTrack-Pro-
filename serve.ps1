$root = 'C:\Users\kenan\.gemini\antigravity\scratch\fittrack-pro'
$port = 7890
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "FitTrack Pro serving on http://localhost:$port"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $url = $ctx.Request.Url.LocalPath
    if ($url -eq '/') { $url = '/index.html' }
    $file = Join-Path $root $url.TrimStart('/')
    $ext = [System.IO.Path]::GetExtension($file)
    $mimeMap = @{
        '.html' = 'text/html; charset=utf-8'
        '.css'  = 'text/css; charset=utf-8'
        '.js'   = 'application/javascript; charset=utf-8'
    }
    $mime = $mimeMap[$ext]
    if (-not $mime) { $mime = 'text/plain' }
    if (Test-Path $file) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType = $mime
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
        $ctx.Response.OutputStream.Write([System.Text.Encoding]::UTF8.GetBytes('Not Found'), 0, 9)
    }
    $ctx.Response.OutputStream.Close()
}
