# Mirror Device (VS Code Extension)

Simple extension to list connected ADB devices and start scrcpy for a selected device directly from VS Code.

## Features
- List USB and WiFi devices (adb devices -l)
- Filter to ready devices only (status = `device`)
- Launch scrcpy silently (no VS Code terminal needed)
- Output Channel logging (Scrcpy) for process output and exit code

## Settings
- `scrcpy.adbPath`: Path to adb (default `adb`)
- `scrcpy.scrcpyPath`: Path to scrcpy (default `scrcpy`)
- `scrcpy.filterStatus`: Hide non-ready devices (unauthorized/offline)

## Usage
1. Command Palette (Ctrl+Shift+P)
2. Run: `Mirror your device: Mirror Device`
3. Pick a device
4. scrcpy window opens immediately

## Requirements
- Install ADB and scrcpy and ensure they are in PATH (or set full paths in settings).

License: MIT

Contributors: [Yassin Ahmed](https://yassin-ahmed.me) & [Adham Shawky](https://adham-shawki.com/)

Website: [Alter Pixel](https://alter-pixel.com)# Mirror-Your-Device
# Mirror-Your-Device
# Mirror-Your-Device
