Option Explicit
Dim WshShell, fso, startupFolder, shortcutPath, scriptDir, shortcut

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
startupFolder = WshShell.SpecialFolders("Startup")
shortcutPath = startupFolder & "\DigitalTwinAthlete.lnk"

Set shortcut = WshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = "wscript.exe"
shortcut.Arguments = """" & scriptDir & "\run_background.vbs"""
shortcut.WorkingDirectory = scriptDir
shortcut.Description = "Digital Twin Athlete - Permanent Live Telemetry Service"
shortcut.Save()

WScript.Echo "[+] Successfully configured Windows Auto-Start!"
WScript.Echo "    Path: " & shortcutPath
WScript.Echo "Twin-Athlete will now start automatically whenever your PC logs on."
