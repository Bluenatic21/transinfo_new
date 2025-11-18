@echo off
setlocal

set SSH_TARGET=root@91.239.207.26

echo ==== GIT PULL на %SSH_TARGET% ====
ssh %SSH_TARGET% "cd /opt/transinfo && git pull --ff-only"

echo.
echo === ГОТОВО ===
pause
endlocal
