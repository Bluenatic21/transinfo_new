@echo off
set SERVER_USER=root
set SERVER_HOST=91.239.207.26

echo === DEPLOY BACKEND на %SERVER_HOST% ===

ssh %SERVER_USER%@%SERVER_HOST% ^
  "cd /opt/transinfo && \
   git pull && \
   cd /opt/transinfo/backend && \
   source .venv/bin/activate && \
   pip install -r requirements.txt && \
   deactivate && \
   sudo systemctl restart transinfo-backend.service && \
   sudo systemctl status --no-pager transinfo-backend.service"

echo.
echo === ГОТОВО: backend обновлён и перезапущен ===
pause
