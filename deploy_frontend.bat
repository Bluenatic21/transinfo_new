@echo off
set SERVER_USER=root
set SERVER_HOST=91.239.207.26

echo === DEPLOY FRONTEND на %SERVER_HOST% ===

ssh %SERVER_USER%@%SERVER_HOST% ^
  "cd /opt/transinfo && \
   git pull && \
   cd /opt/transinfo/frontend && \
   npm install --omit=dev && \
   npm run build && \
   sudo systemctl restart transinfo-frontend.service && \
   sudo systemctl status --no-pager transinfo-frontend.service"

echo.
echo === ГОТОВО: frontend обновлён и перезапущен ===
pause
