Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Remove-PathIfExists {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Ensure-Contains {
  param(
    [string]$Path,
    [string]$Needle
  )

  $content = Get-Content -LiteralPath $Path -Raw
  if (-not $content.Contains($Needle)) {
    $newContent = $content.TrimEnd() + "`r`n`r`n" + $Needle.Trim() + "`r`n"
    Set-Content -LiteralPath $Path -Value $newContent
  }
}

function Replace-Once {
  param(
    [string]$Path,
    [string]$OldValue,
    [string]$NewValue
  )

  $content = Get-Content -LiteralPath $Path -Raw
  if ($content.Contains($NewValue)) {
    return
  }
  if (-not $content.Contains($OldValue)) {
    throw "Replace target not found: $Path"
  }
  Set-Content -LiteralPath $Path -Value $content.Replace($OldValue, $NewValue)
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildRoot = "D:\GT_WIN_APK_LOCAL"
$androidSdkRoot = "D:\install\Android Studio SDK"
$temurinRoot = "D:\install\temurin17"
$distDir = Join-Path $projectRoot "dist"

if (-not (Test-Path -LiteralPath $androidSdkRoot)) {
  throw "Android SDK not found: $androidSdkRoot"
}

if (-not (Test-Path -LiteralPath $temurinRoot)) {
  throw "JDK 17 root not found: $temurinRoot"
}

$jdkHome = Get-ChildItem -LiteralPath $temurinRoot -Directory | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdkHome) {
  throw "No JDK 17 folder found under: $temurinRoot"
}

$gradlePropsAppend = @'
# Use the Expo/RN expected NDK version for SDK 55 / RN 0.83.
ndkVersion=27.1.12297006

# Use the locally installed JDK instead of Gradle toolchain auto-resolution.
react.internal.disableJavaVersionAlignment=true
'@

$androidBuildGradleOld = @'
allprojects {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
'@

$androidBuildGradleNew = @'
allprojects {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }
}

subprojects { subproject ->
  afterEvaluate {
    if (subproject.plugins.hasPlugin("com.android.application") || subproject.plugins.hasPlugin("com.android.library")) {
      subproject.android {
        compileOptions {
          sourceCompatibility JavaVersion.VERSION_17
          targetCompatibility JavaVersion.VERSION_17
        }
      }
    }

    subproject.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
      kotlinOptions {
        jvmTarget = "17"
      }
    }
  }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
'@

$foojayOld = 'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }'
$foojayNew = @'
// Disabled for this local Windows build because the bundled resolver version
// is incompatible with the Gradle runtime available here.
'@

$gestureOld = @'
target_link_libraries(
  ${PACKAGE_NAME}
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)
'@

$gestureNew = @'
target_link_libraries(
  ${PACKAGE_NAME}
  c++_shared
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)
'@

$screensNewArchOld = @'
    target_link_libraries(rnscreens
        ReactAndroid::reactnative
        ReactAndroid::jsi
        fbjni::fbjni
        android
    )
'@

$screensNewArchNew = @'
    target_link_libraries(rnscreens
        c++_shared
        ReactAndroid::reactnative
        ReactAndroid::jsi
        fbjni::fbjni
        android
    )
'@

$screensOldArchOld = @'
    target_link_libraries(rnscreens
        ReactAndroid::jsi
        android
    )
'@

$screensOldArchNew = @'
    target_link_libraries(rnscreens
        c++_shared
        ReactAndroid::jsi
        android
    )
'@

$expoCoreOld = @'
target_link_libraries(
  expo-modules-core
  PRIVATE
  ${LOG_LIB}
  android
  ${JSEXECUTOR_LIB}
  ${NEW_ARCHITECTURE_DEPENDENCIES}
  expo-modules-jsi
)
'@

$expoCoreNew = @'
target_link_libraries(
  expo-modules-core
  PRIVATE
  c++_shared
  ${LOG_LIB}
  android
  ${JSEXECUTOR_LIB}
  ${NEW_ARCHITECTURE_DEPENDENCIES}
  expo-modules-jsi
)
'@

$rnAppCmakeOld = @'
target_link_libraries(${CMAKE_PROJECT_NAME}
        fbjni                               # via 3rd party prefab
        jsi                                 # prefab ready
        reactnative                         # prefab ready
)
'@

$rnAppCmakeNew = @'
target_link_libraries(${CMAKE_PROJECT_NAME}
        c++_shared
        fbjni                               # via 3rd party prefab
        jsi                                 # prefab ready
        reactnative                         # prefab ready
)
'@

$commonFlagsOld = @'
add_library(common_flags INTERFACE)
target_compile_options(common_flags INTERFACE ${folly_FLAGS})
'@

$commonFlagsNew = @'
add_library(common_flags INTERFACE)
target_compile_options(common_flags INTERFACE ${folly_FLAGS})
target_link_libraries(common_flags INTERFACE c++_shared)
'@

Write-Step "Prepare build workspace"
Remove-PathIfExists $buildRoot
New-Item -ItemType Directory -Path $buildRoot | Out-Null

$null = robocopy $projectRoot $buildRoot /MIR /XD node_modules .git .expo android ios dist
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code: $LASTEXITCODE"
}

Write-Step "Copy node_modules"
Copy-Item -Recurse -Force (Join-Path $projectRoot "node_modules") (Join-Path $buildRoot "node_modules")

Write-Step "Run expo prebuild"
Push-Location $buildRoot
try {
  npx expo prebuild -p android
}
finally {
  Pop-Location
}

Write-Step "Apply local build patches"
Ensure-Contains -Path (Join-Path $buildRoot "android\gradle.properties") -Needle $gradlePropsAppend
Replace-Once -Path (Join-Path $buildRoot "android\build.gradle") -OldValue $androidBuildGradleOld -NewValue $androidBuildGradleNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\@react-native\gradle-plugin\settings.gradle.kts") -OldValue $foojayOld -NewValue $foojayNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\react-native-gesture-handler\android\src\main\jni\CMakeLists.txt") -OldValue $gestureOld -NewValue $gestureNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\react-native-screens\android\CMakeLists.txt") -OldValue $screensNewArchOld -NewValue $screensNewArchNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\react-native-screens\android\CMakeLists.txt") -OldValue $screensOldArchOld -NewValue $screensOldArchNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\expo-modules-core\android\cmake\main.cmake") -OldValue $expoCoreOld -NewValue $expoCoreNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\react-native\ReactAndroid\cmake-utils\ReactNative-application.cmake") -OldValue $rnAppCmakeOld -NewValue $rnAppCmakeNew
Replace-Once -Path (Join-Path $buildRoot "node_modules\react-native\ReactAndroid\cmake-utils\ReactNative-application.cmake") -OldValue $commonFlagsOld -NewValue $commonFlagsNew

Write-Step "Clean native caches"
Remove-PathIfExists (Join-Path $buildRoot "android\app\.cxx")
Remove-PathIfExists (Join-Path $buildRoot "android\app\build")

Get-ChildItem -LiteralPath (Join-Path $buildRoot "node_modules") -Directory | ForEach-Object {
  $androidDir = Join-Path $_.FullName "android"
  if (Test-Path -LiteralPath $androidDir) {
    Remove-PathIfExists (Join-Path $androidDir ".cxx")
    Remove-PathIfExists (Join-Path $androidDir "build")
  }
}

Write-Step "Build release APK"
$env:JAVA_HOME = $jdkHome
$env:PATH = "$jdkHome\bin;$env:PATH"
$env:ANDROID_HOME = $androidSdkRoot
$env:ANDROID_SDK_ROOT = $androidSdkRoot
$env:NODE_ENV = "production"

Push-Location (Join-Path $buildRoot "android")
try {
  .\gradlew.bat assembleRelease --no-daemon
}
finally {
  Pop-Location
}

$apkPath = Join-Path $buildRoot "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path -LiteralPath $apkPath)) {
  throw "APK not found: $apkPath"
}

Write-Step "Copy APK to dist"
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$distApkPath = Join-Path $distDir "gt-mobile-release.apk"
Copy-Item -LiteralPath $apkPath -Destination $distApkPath -Force

$apkItem = Get-Item -LiteralPath $distApkPath
Write-Host ""
Write-Host "APK build finished" -ForegroundColor Green
Write-Host "Output: $($apkItem.FullName)"
Write-Host "Size: $([math]::Round($apkItem.Length / 1MB, 2)) MB"
Write-Host "Time: $($apkItem.LastWriteTime)"
