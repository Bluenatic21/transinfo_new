@echo off
setlocal

set SERVER_USER=root
set SERVER_HOST=91.239.207.26

echo === DEPLOY FRONTEND на %SERVER_HOST% ===

REM 1) подтягиваем свежий код репозитория
ssh %SERVER_USER%@%SERVER_HOST% "cd /opt/transinfo && git pull --ff-only"

REM 2) ставим/обновляем зависимости фронта (без dev-зависимостей)
ssh %SERVER_USER%@%SERVER_HOST% "cd /opt/transinfo/frontend && npm install --omit=dev"

REM 3) собираем фронт
ssh %SERVER_USER%@%SERVER_HOST% "cd /opt/transinfo/frontend && npm run build"

REM 4) перезапускаем frontend-сервис
ssh %SERVER_USER%@%SERVER_HOST% "systemctl restart transinfo-frontend.service"

REM 5) смотрим статус
ssh %SERVER_USER%@%SERVER_HOST% "systemctl --no-pager status transinfo-frontend.service"

echo.
echo === ГОТОВО: frontend обновлён и перезапущен ===
pause
endlocal
