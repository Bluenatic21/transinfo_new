@echo off
title Restart transinfo FRONTEND

echo Пересборка и перезапуск frontend на 91.239.207.26 ...
ssh root@91.239.207.26 "cd /opt/transinfo/frontend && npm run build && sudo systemctl restart transinfo-frontend.service && sudo systemctl status transinfo-frontend.service --no-pager -l"

echo.
echo Готово. Нажми любую клавишу, чтобы закрыть окно.
pause >nul
