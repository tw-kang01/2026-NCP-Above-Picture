<#
  공개용 소스만 업데이트 ZIP으로 묶는 PC용 도구입니다.
  Git 추적 목록을 쓰므로 리팩토링으로 늘어난 파일을 빠뜨리지 않습니다.
  실제 키·기록·사진·설치된 도구·빌드 결과는 공개 전 검사에서 제외합니다.
  서버에서는 ZIP을 푼 뒤 npm ci와 npm run build를 다시 실행합니다.
#>
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Split-Path $projectRoot -Parent }
$outputRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path
$updateArchive = Join-Path $outputRoot 'photo-memory-update.zip'
$stagedArchive = Join-Path $outputRoot ('photo-memory-update.' + [guid]::NewGuid().ToString('N') + '.tmp')
Push-Location -LiteralPath $projectRoot
try {
  # 새 공개 파일은 먼저 git add로 등록해 두어야 목록에 포함됩니다.
  $files = @(git -c core.quotepath=false ls-files)
  if ($LASTEXITCODE -ne 0 -or $files.Count -eq 0) { throw 'Run git add before packaging the public source.' }
  node scripts/check-publish.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Publication checks failed. No archive was replaced.' }
  # 완성한 ZIP을 검증한 뒤 교체하여 생성에 실패한 파일을 배포하지 않습니다.
  $stream = [System.IO.File]::Open($stagedArchive, [System.IO.FileMode]::CreateNew)
  $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($relative in $files) {
      $source = Join-Path $projectRoot $relative
      if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing public file: $relative" }
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $source, "photo-memory-app/$relative") | Out-Null
    }
  } finally { $zip.Dispose(); $stream.Dispose() }
  $zip = [System.IO.Compression.ZipFile]::OpenRead($stagedArchive)
  try {
    if ($zip.Entries.Count -ne $files.Count) { throw 'Archive entry count mismatch.' }
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -match '/(?:\.env(?!\.example$)|\.data/|node_modules/|\.next/|artifacts/)') { throw 'Private or runtime file in archive.' }
    }
  } finally { $zip.Dispose() }
  # 대상은 확인한 출력 디렉터리 바로 아래의 단일 ZIP 파일입니다.
  if ((Test-Path -LiteralPath $updateArchive) -and (Get-Item -LiteralPath $updateArchive).Length -gt 0) {
    Copy-Item -LiteralPath $updateArchive -Destination "$updateArchive.previous" -Force
  }
  Move-Item -LiteralPath $stagedArchive -Destination $updateArchive -Force
  Get-Item -LiteralPath $updateArchive | Select-Object FullName, Length
  Get-FileHash -LiteralPath $updateArchive -Algorithm SHA256
} finally { Pop-Location }
