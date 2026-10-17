import pytest
from app.core.security import SecurityEngine, SecurityViolationError

CATASTROPHIC = [
    r"Remove-Item -Recurse -Force C:\ ",
    r"Remove-Item -Recurse -Force C:\*",
    "rm -rf /",
    r"del /s /q C:\Windows",
    r"Remove-Item C:\Users\joshi -Recurse",
    "format D:",
    "diskpart",
    "rd /s /q %USERPROFILE%",
    "Remove-Item -Recurse $env:USERPROFILE",
    "vssadmin delete shadows /all",
]

ALLOWED = [
    r"Get-ChildItem C:\ ",
    r"Remove-Item .\build -Recurse",
    "rm -rf node_modules",
    r"del C:\Users\joshi\Desktop\old.txt",
    r"Remove-Item C:\Users\joshi\Downloads\x.zip",
    "python -m http.server 9000",
    "Get-Process | Format-Table",
    "Start-Process notepad",
    "git status",
]


@pytest.mark.parametrize("command", CATASTROPHIC)
def test_catastrophic_commands_are_blocked(command):
    with pytest.raises(SecurityViolationError):
        SecurityEngine.check_host_command(command)


@pytest.mark.parametrize("command", ALLOWED)
def test_everyday_commands_are_allowed(command):
    SecurityEngine.check_host_command(command)
