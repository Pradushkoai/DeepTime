@echo off
chcp 65001 >nul 2>&1
title DeepTime - Vertical Slice Prototype

REM ============================================================================
REM DeepTime — запуск Web UI под Windows одной командой
REM
REM Что делает:
REM   1. Клонирует репозиторий DeepTime в C:\DeepTime
REM   2. Устанавливает портативный Python (через uv — без прав админа)
REM   3. Ставит Flask
REM   4. Запускает сервер на http://127.0.0.1:5001/
REM   5. Открывает браузер
REM
REM Требования:
REM   - Windows 10/11
REM   - git (скачай с https://git-scm.com/download/win если нет)
REM   - Интернет
REM
REM Запуск: дважды кликни на этот файл
REM ============================================================================

echo ============================================================================
echo   DeepTime — Vertical Slice Prototype (Windows Launcher)
echo ============================================================================

REM --- Конфигурация ---
set REPO_URL=https://github.com/Pradushkoai/DeepTime.git
set INSTALL_DIR=%USERPROFILE%\DeepTime
set UV_URL=https://astral.sh/uv/install.ps1
set UV_DIR=%USERPROFILE%\.local\bin

REM --- Проверка git ---
where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ОШИБКА] git не найден в PATH.
    echo Скачай и установи: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo.
echo [1/5] Проверка git... OK
echo.

REM --- Клонирование репозитория ---
if exist "%INSTALL_DIR%\.git" (
    echo [2/5] Репозиторий уже существует в %INSTALL_DIR%
    echo       Обновляю...
    cd /d "%INSTALL_DIR%"
    git pull origin main
) else (
    echo [2/5] Клонирую репозиторий в %INSTALL_DIR%...
    git clone %REPO_URL% "%INSTALL_DIR%"
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось клонировать репозиторий.
        pause
        exit /b 1
    )
)
cd /d "%INSTALL_DIR%"
echo.

REM --- Установка uv (портативный Python без прав админа) ---
if exist "%UV_DIR%\uv.exe" (
    echo [3/5] uv уже установлен в %UV_DIR%
) else (
    echo [3/5] Устанавливаю uv (портативный Python)...
    powershell -ExecutionPolicy ByPass -Command "irm %UV_URL% | iex"
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить uv.
        echo Попробуй вручную: powershell -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
        pause
        exit /b 1
    )
)
set PATH=%UV_DIR%;%PATH%
echo.

REM --- Установка Python и Flask через uv ---
echo [4/5] Устанавливаю Python и Flask...
cd /d "%INSTALL_DIR%\scripts\vertical_slice"
uv python install 3.12
uv venv --python 3.12
call .venv\Scripts\activate.bat
uv pip install flask
if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить Flask.
    pause
    exit /b 1
)
echo.

REM --- Запуск сервера ---
echo [5/5] Запускаю сервер...
echo.
echo ============================================================================
echo   Готово! Открываю браузер...
echo.
echo   URL:  http://127.0.0.1:5001/
echo.
echo   Чтобы остановить сервер: закрой это окно
echo ============================================================================
echo.

REM Открыть браузер через 3 секунды (чтобы сервер успел стартовать)
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5001/"

REM Запустить Flask
python web\web_app.py

REM Если сервер остановился — не закрывать окно сразу
echo.
echo ============================================================================
echo   Сервер остановлен. Нажми любую клавишу для выхода.
echo ============================================================================
pause
