Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = fso.BuildPath(scriptDir, "start-drive-sync.cmd")
shell.Run Chr(34) & cmdPath & Chr(34), 0, False