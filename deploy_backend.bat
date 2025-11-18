@echo off
setlocal

set SERVER_USER=root
set SERVER_HOST=91.239.207.26

echo === DEPLOY BACKEND на %SERVER_HOST% ===

REM 1) подтягиваем свежий код репозитория
ssh %SERVER_USER%@%SERVER_HOST% "cd /opt/transinfo && git pull --ff-only"

REM 2) обновляем зависимости в виртуальном окружении backend
ssh %SERVER_USER%@%SERVER_HOST% "cd /opt/transinfo/backend && .venv/bin/pip install -r requirements.txt"

REM 3) перезапускаем backend-сервис
ssh %SERVER_USER%@%SERVER_HOST% "systemctl restart transinfo-backend.service"

REM 4) смотрим статус
ssh %SERVER_USER%@%SERVER_HOST% "systemctl --no-pager status transinfo-backend.service"

echo.
echo === ГОТОВО: backend обновлён и перезапущен ===
pause
endlocal
