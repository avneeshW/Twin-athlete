Option Explicit
Dim WshShell, fso, startupFolder, shortcutPath

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

startupFolder = WshShell.SpecialFolders("Startup")
shortcutPath = startupFolder & "\DigitalTwinAthlete.lnk"

If fso.FileExists(shortcutPath) Then
    fso.DeleteFile(shortcutPath), True
    WScript.Echo "[+] Successfully removed Digital Twin Athlete from Windows Startup."
Else
    WScript.Echo "[-] Auto-start shortcut was not found or already removed."
End If
