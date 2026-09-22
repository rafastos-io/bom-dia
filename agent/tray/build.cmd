@echo off
setlocal
cd /d "%~dp0"

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo csc.exe nao encontrado ^(.NET Framework 4.x ausente^).
  exit /b 1
)

"%CSC%" /nologo /target:winexe /platform:anycpu /optimize+ ^
  /reference:System.dll ^
  /reference:System.Drawing.dll ^
  /reference:System.Windows.Forms.dll ^
  /reference:System.Management.dll ^
  /reference:Microsoft.CSharp.dll ^
  /win32icon:bandeja.ico ^
  /resource:bandeja.ico,bandeja.ico ^
  /win32manifest:app.manifest ^
  /out:BomDiaRadarTray.exe ^
  Tray.cs
if errorlevel 1 (
  echo Falha ao compilar a bandeja.
  exit /b 1
)

echo OK: tray\BomDiaRadarTray.exe
echo Instale os atalhos com: BomDiaRadarTray.exe --instalar
