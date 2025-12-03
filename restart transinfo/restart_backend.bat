@echo off
title Restart transinfo BACKEND

echo Перезапуск backend на 91.239.207.26 ...
ssh root@91.239.207.26 "cd /opt/transinfo/backend && sudo systemctl restart transinfo-backend.service && sudo systemctl status transinfo-backend.service --no-pager -l"

echo.
echo Готово. Нажми любую клавишу, чтобы закрыть окно.
pause >nul
