Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c """ & scriptDirectory & "\start-drive-sync.cmd"""", 0, False
