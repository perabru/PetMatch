@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 iniciar.py
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3 não foi encontrado. Abra index.html diretamente no navegador.
    ) else (
        python iniciar.py
    )
)
pause
