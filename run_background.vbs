' ==============================================================================
' Digital Twin Athlete - Silent Background Server Runner
' Starts the Python backend with NO visible console window.
' The server persists in the background until explicitly stopped.
' ==============================================================================
Option Explicit

Dim fso, scriptDir, WshShell, command

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir

command = "cmd.exe /c python app.py"
WshShell.Run command, 0, False

Set WshShell = Nothing
Set fso = Nothing
