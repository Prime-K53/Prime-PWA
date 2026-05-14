@echo off
REM Prime ERP System - Build EXE Script (Windows)
REM This script builds the application into an executable installer

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Prime ERP System - Building Executable
echo ========================================
echo.

REM Set error flag
set ERROR_OCCURRED=0

REM Step 1: Build the frontend
echo [1/3] Building frontend application...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed
    set ERROR_OCCURRED=1
    goto :ERROR_HANDLER
)
echo √ Frontend build complete
echo.

REM Step 2: Check if electron is installed
echo [2/3] Checking dependencies...
npm list electron --depth=0 >nul 2>&1
if errorlevel 1 (
    echo WARNING: Electron not installed. Installing...
    call npm install electron --save-dev --force --no-optional
    if errorlevel 1 (
        echo ERROR: Electron installation failed
        echo Try: npm install electron --save-dev --force
        set ERROR_OCCURRED=1
        goto :ERROR_HANDLER
    )
)

npm list electron-builder --depth=0 >nul 2>&1
if errorlevel 1 (
    echo WARNING: electron-builder not installed. Installing...
    call npm install electron-builder --save-dev --force --no-optional
    if errorlevel 1 (
        echo ERROR: electron-builder installation failed
        echo Try: npm install electron-builder --save-dev --force
        set ERROR_OCCURRED=1
        goto :ERROR_HANDLER
    )
)
echo √ Dependencies verified
echo.

REM Step 3: Build executables
echo [3/3] Building executable installers...
call npm run electron:build
if errorlevel 1 (
    echo ERROR: Build failed
    set ERROR_OCCURRED=1
    goto :ERROR_HANDLER
)
echo √ Executable build complete
echo.

REM Success
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo Installers created in: dist-electron\
echo.
echo Files:
echo   - PrimeERP-Setup.exe (installer with uninstaller)
echo   - PrimeERP.exe (portable executable)
echo.
echo Next steps:
echo   1. Test the executables
echo   2. Distribute to users
echo   3. Or sign with a code certificate for trust
echo.
goto :END

:ERROR_HANDLER
echo.
echo ========================================
echo BUILD FAILED
echo ========================================
echo.
echo If you're getting SSL/TLS errors:
echo   1. Run: npm config set strict-ssl false
echo   2. Try: npm install electron --save-dev --force
echo   3. Then: npm run electron:build
echo.

:END
endlocal
pause
