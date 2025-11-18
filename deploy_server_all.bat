@echo off
setlocal

rem === НАСТРОЙКА: куда подключаться ===
rem здесь укажи то же, что используешь в VS Code (например root@transinfo или root@X.X.X.X)
set SSH_TARGET=root@91.239.207.26

echo ==== GIT PULL на %SSH_TARGET% ====
ssh %SSH_TARGET% "cd /opt/transinfo && git pull --ff-only"

echo ==== РЕСТАРТ backend ====
ssh %SSH_TARGET% "systemctl restart transinfo-backend.service"

echo ==== РЕСТАРТ frontend ====
ssh %SSH_TARGET% "systemctl restart transinfo-frontend.service"

echo ==== СТАТУС СЕРВИСОВ ====
ssh %SSH_TARGET% "systemctl --no-pager status transinfo-backend.service transinfo-frontend.service"

echo.
echo === ГОТОВО ===
pause
endlocal