
' Job Automation Bot — Silent Startup Launcher
' Starts backend + frontend with no visible console windows

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Wait 20 seconds after login for system to settle
WScript.Sleep 20000

' Kill any leftover processes on those ports first
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :3004') do taskkill /F /PID %a", 0, True
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr :5173') do taskkill /F /PID %a", 0, True

WScript.Sleep 2000

' Start backend server (hidden, logs to file)
WshShell.Run "cmd /c cd /d C:\Users\polak\JobAutomation && node server.js >> logs\server.log 2>&1", 0, False

WScript.Sleep 4000

' Start frontend (hidden, logs to file)
WshShell.Run "cmd /c cd /d C:\Users\polak\JobAutomation\client && npm run dev >> ..\logs\client.log 2>&1", 0, False

Set WshShell = Nothing
