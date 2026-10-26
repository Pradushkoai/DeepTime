# ============================================================================
# DeepTime — запуск Web UI под Windows (PowerShell)
#
# Запуск: PowerShell → правый клик на файле → "Run with PowerShell"
# Или: powershell -ExecutionPolicy Bypass -File run_windows.ps1
#
# Что делает:
#   1. Клонирует репо DeepTime в $env:USERPROFILE\DeepTime
#   2. Ставит uv (портативный Python, без прав админа)
#   3. Ставит Flask
#   4. Запускает сервер на http://127.0.0.1:5001/
#   5. Открывает браузер
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  DeepTime — Vertical Slice Prototype (Windows PowerShell Launcher)" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# --- Конфигурация ---
$REPO_URL = "https://github.com/Pradushkoai/DeepTime.git"
$INSTALL_DIR = "$env:USERPROFILE\DeepTime"
$UV_DIR = "$env:USERPROFILE\.local\bin"

# --- Проверка git ---
Write-Host "[1/5] Проверка git... " -NoNewline
$gitVersion = git --version 2>$null
if (-not $gitVersion) {
    Write-Host "НЕ НАЙДЕН" -ForegroundColor Red
    Write-Host ""
    Write-Host "Скачай и установи git: https://git-scm.com/download/win" -ForegroundColor Yellow
    Read-Host "Нажми Enter для выхода"
    exit 1
}
Write-Host "OK ($gitVersion)" -ForegroundColor Green
Write-Host ""

# --- Клонирование ---
if (Test-Path "$INSTALL_DIR\.git") {
    Write-Host "[2/5] Репозиторий уже существует: $INSTALL_DIR"
    Write-Host "      Обновляю..."
    Set-Location $INSTALL_DIR
    git pull origin main
} else {
    Write-Host "[2/5] Клонирую репозиторий в $INSTALL_DIR..."
    git clone $REPO_URL $INSTALL_DIR
    if (-not $?) {
        Write-Host "[ОШИБКА] Не удалось клонировать репозиторий" -ForegroundColor Red
        Read-Host "Нажми Enter для выхода"
        exit 1
    }
}
Set-Location $INSTALL_DIR
Write-Host ""

# --- Установка uv ---
if (Test-Path "$UV_DIR\uv.exe") {
    Write-Host "[3/5] uv уже установлен: $UV_DIR\uv.exe" -ForegroundColor Green
} else {
    Write-Host "[3/5] Устанавливаю uv (портативный Python)..."
    powershell -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    if (-not $?) {
        Write-Host "[ОШИБКА] Не удалось установить uv" -ForegroundColor Red
        Read-Host "Нажми Enter для выхода"
        exit 1
    }
}
$env:Path = "$UV_DIR;$env:Path"
Write-Host ""

# --- Установка Python и Flask ---
Write-Host "[4/5] Устанавливаю Python 3.12 и Flask..."
Set-Location "$INSTALL_DIR\scripts\vertical_slice"
uv python install 3.12
uv venv --python 3.12
& .\.venv\Scripts\Activate.ps1
uv pip install flask
if (-not $?) {
    Write-Host "[ОШИБКА] Не удалось установить Flask" -ForegroundColor Red
    Read-Host "Нажми Enter для выхода"
    exit 1
}
Write-Host ""

# --- Запуск сервера ---
Write-Host "[5/5] Запускаю сервер..." -ForegroundColor Green
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Готово! Открываю браузер..." -ForegroundColor Green
Write-Host ""
Write-Host "  URL:  http://127.0.0.1:5001/" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Чтобы остановить сервер: закрой это окно" -ForegroundColor Gray
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Открыть браузер через 3 секунды
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:5001/"
} | Out-Null

# Запустить Flask
python web\web_app.py

# Если сервер остановился
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Сервер остановлен." -ForegroundColor Yellow
Write-Host "============================================================================" -ForegroundColor Cyan
Read-Host "Нажми Enter для выхода"
