@echo off
set SERVER_USER=root
set SERVER_HOST=91.239.207.26

echo === FULL DEPLOY на %SERVER_HOST% (backend + frontend) ===

ssh %SERVER_USER%@%SERVER_HOST% ^
  "cd /opt/transinfo && \
   git pull && \
   cd /opt/transinfo/backend && \
   source .venv/bin/activate && \
   pip install -r requirements.txt && \
   deactivate && \
   sudo systemctl restart transinfo-backend.service && \
   cd /opt/transinfo/frontend && \
   npm install --omit=dev && \
   npm run build && \
   sudo systemctl restart transinfo-frontend.service"

echo.
echo === ГОТОВО: backend и frontend обновлены ===
pause
