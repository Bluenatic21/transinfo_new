@echo off
cd /d D:\TeamShare\transinfo_new

git status
echo.
echo Введи сообщение коммита:
set /p MSG=Commit message: 

git add .
git commit -m "%MSG%"
git push

pause
