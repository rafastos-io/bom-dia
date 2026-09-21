@echo off
rem Mantem o agente vivo: se cair, espera 10 s e volta.
cd /d "%~dp0"
:loop
node src\index.js watch >> radar-agent.log 2>&1
timeout /t 10 /nobreak > nul
goto loop
