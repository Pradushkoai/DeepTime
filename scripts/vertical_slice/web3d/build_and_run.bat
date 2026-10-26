@echo off
chcp 65001 >nul 2>&1
title DeepTime 3D — Сборка и запуск

REM ============================================================================
REM DeepTime 3D — сборка и запуск под Windows
REM
REM Что делает:
REM   1. Клонирует/обновляет репозиторий
REM   2. Запускает HTTP сервер для 3D прототипа
REM   3. Открывает браузер
REM
REM Запуск: дважды кликни на этот файл
REM Требования: Python 3 (https://python.org) и git (https://git-scm.com)
REM ============================================================================

echo ============================================================================
echo   DeepTime 3D — Сборка и запуск
echo ============================================================================

REM --- Проверка git ---
where git >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] git не найден. Скачай: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM --- Проверка Python ---
where python >nul 2>&1
if errorlevel 1 (
    where python3 >nul 2>&1
    if errorlevel 1 (
        echo [ОШИБКА] Python не найден. Скачай: https://python.org
        pause
        exit /b 1
    )
    set PY=python3
) else (
    set PY=python
)

REM --- Клонирование/обновление ---
set INSTALL_DIR=%USERPROFILE%\DeepTime

if exist "%INSTALL_DIR%\.git" (
    echo [1/3] Обновляю репозиторий...
    cd /d "%INSTALL_DIR%"
    git pull origin main
) else (
    echo [1/3] Клонирую репозиторий...
    git clone https://github.com/Pradushkoai/DeepTime.git "%INSTALL_DIR%"
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось клонировать
        pause
        exit /b 1
    )
)

REM --- Запуск сервера ---
echo.
echo [2/3] Запускаю сервер...
cd /d "%INSTALL_DIR%\scripts\vertical_slice\web3d"

echo.
echo ============================================================================
echo   Готово!
echo.
echo   URL:  http://127.0.0.1:5002/
echo.
echo   Управление:
echo     🌍 Карта       — глобальная карта (360x180 гексов)
echo     ⏸ Пауза        — пауза симуляции
echo     1x/2x/3x       — скорость времени
echo     🎚 Ползунки     — приоритеты (еда/запасы/стройка)
echo     Мышь           — вращение камеры, зум
echo.
echo   Чтобы остановить: закрой это окно
echo ============================================================================

REM --- Открыть браузер ---
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5002/"

REM --- HTTP сервер ---
%PY% -m http.server 5002

pause
