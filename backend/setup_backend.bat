@echo off
cd /d %~dp0

REM создаём виртуальное окружение, если его ещё нет
if not exist .venv (
    py -3 -m venv .venv
)

call .venv\Scripts\activate.bat

pip install --upgrade pip
pip install -r requirements.txt

echo.
echo Backend environment is ready.
pause
