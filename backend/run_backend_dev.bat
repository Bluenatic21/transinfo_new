@echo off
REM Переходим в папку backend (где лежит main.py, .env.local и .venv)
cd /d "%~dp0"

REM Активируем виртуальное окружение
call .venv\Scripts\activate.bat

REM Стартуем uvicorn и явно говорим, откуда брать .env
python -m uvicorn main:app ^
  --host 127.0.0.1 ^
  --port 8004 ^
  --reload ^
  --env-file .env.local

pause