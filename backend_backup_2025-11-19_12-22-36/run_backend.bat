@echo off
setlocal
cd /d "%~dp0"

REM [опционально] активировать venv, если используешь:
if exist ".venv\Scripts\activate.bat" call .venv\Scripts\activate

set "AUTO_CREATE_DB=1"

REM Минимально-стабильный запуск (рекомендуется сначала так проверить):
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir .

REM Если всё ок, можешь использовать с исключениями (раскомментируй строку ниже, а предыдущую закомментируй):
REM python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir . ^
REM   --reload-exclude "static/*" ^
REM   --reload-exclude "static/uploads/*" ^
REM   --reload-exclude ".venv/*" ^
REM   --reload-exclude "node_modules/*"

endlocal
