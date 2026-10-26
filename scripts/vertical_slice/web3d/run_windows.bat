@echo off
chcp 65001 >nul 2>&1
title DeepTime 3D — Vertical Slice

REM ============================================================================
REM DeepTime 3D — запуск под Windows
REM
REM Запуск: дважды кликни на этот файл
REM Откроется браузер с 3D игрой
REM ============================================================================

echo ============================================================================
echo   DeepTime 3D — Vertical Slice Prototype
echo ============================================================================

REM Найти Python
where python >nul 2>&1
if errorlevel 1 (
    where python3 >nul 2>&1
    if errorlevel 1 (
        echo Python не найден. Установи Python 3 с https://python.org
        pause
        exit /b 1
    )
    set PY=python3
) else (
    set PY=python
)

REM Запустить HTTP сервер
echo.
echo Запускаю сервер на http://127.0.0.1:5002/
echo.

REM Открыть браузер через 2 секунды
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5002/"

REM Запустить сервер в текущей директории
cd /d "%~dp0"
%PY% -m http.server 5002

pause
