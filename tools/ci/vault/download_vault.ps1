$ErrorActionPreference = "Stop"

echo "Running on $([Environment]::MachineName)..."

& {
    $PSNativeCommandUseErrorActionPreference = $true
    $ProgressPreference = 'SilentlyContinue'
    $Url = "$env:VAULT_WINDOWS_URL"
    $DownloadZipFile = [IO.Path]::Combine((Get-Location).path, $(Split-Path -Path $Url -Leaf))
    mkdir tempbin
    Invoke-WebRequest -Uri $Url -OutFile $DownloadZipFile
    Expand-Archive $DownloadZipFile -DestinationPath tempbin -Force
    Remove-Item -Path $DownloadZipFile -Force
    $Env:PATH += ";"
    $Env:PATH += [IO.Path]::Combine((Get-Location).path, "tempbin")
}

$ProgressPreference = 'Continue'

if(!$?) { Exit $LASTEXITCODE }
