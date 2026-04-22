@echo off
echo Stopping Job Automation Bot...

:: Kill node processes on port 3004
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3004 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill vite on port 5173/5174
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5174 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Bot stopped.
timeout /t 2 >nul
