# Builds the Android app, installs it on the phone plugged in over USB, and opens it.
# Run it with `npm run mobile:run` from the repo root (that also rebuilds the website first).
$ErrorActionPreference = 'Stop'

# Java: use JAVA_HOME if set, otherwise the JDK that ships with Android Studio.
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  $studioJdk = 'C:\Program Files\Android\Android Studio\jbr'
  if (Test-Path "$studioJdk\bin\java.exe") { $env:JAVA_HOME = $studioJdk }
  else { throw 'Java not found. Install Android Studio or set JAVA_HOME to a JDK 21.' }
}

# adb: from PATH, otherwise from the Android SDK.
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (-not (Test-Path $adb)) { throw 'adb not found. Install the Android SDK platform-tools.' }

$devices = & $adb devices | Select-String "`tdevice$"
if (-not $devices) { throw 'No phone found. Plug it in, unlock it and accept the USB debugging prompt.' }

Push-Location (Join-Path $PSScriptRoot 'android')
try {
  & .\gradlew.bat installDebug --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
} finally {
  Pop-Location
}

& $adb shell monkey -p tn.sonae.app -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host 'Sonae is installed and open on your phone.'
