param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)

if ([IO.Path]::GetExtension($resolvedInput) -ne '.pptx') {
  throw 'Only .pptx files are supported.'
}

$outputDirectory = Split-Path -Parent $resolvedOutput
if ($outputDirectory) { [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null }

$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.DisplayAlerts = 1
  $presentation = $powerPoint.Presentations.Open($resolvedInput, $true, $false, $false)
  $presentation.SaveAs($resolvedOutput, 32)
  if (-not (Test-Path -LiteralPath $resolvedOutput)) {
    throw 'PowerPoint did not create the PDF.'
  }
}
finally {
  if ($presentation) {
    $presentation.Close()
    [Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
  }
  if ($powerPoint) {
    $powerPoint.Quit()
    [Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
