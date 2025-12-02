@echo off
REM Применяем патч от Codex к репозиторию transinfo_new

REM 1) Переходим в корень репозитория
cd /d D:\TeamShare\transinfo_new

REM 2) Проверяем, что файл с патчем существует
if not exist codex_patch.diff (
  echo [ERROR] Не найден файл codex_patch.diff в корне репозитория.
  echo Сначала в Codex нажми "Копировать патч",
  echo потом вставь содержимое в codex_patch.diff и сохрани.
  pause
  goto :eof
)

REM 3) Применяем патч
echo.
echo Применяем патч из codex_patch.diff ...
git apply --whitespace=nowarn codex_patch.diff
if errorlevel 1 (
  echo.
  echo [ERROR] git apply завершился с ошибкой. Патч не применился.
  echo Проверь, что рабочее дерево чистое (git status) и патч свежий.
  pause
  goto :eof
)

echo.
echo [OK] Патч успешно применён.
echo Текущее состояние репозитория:
git status

echo.
pause
