"""Keeps background child processes from flashing console windows on Windows.

When City AI runs as the desktop app (pythonw, no console of its own), Windows gives every console child
process (git, pytest, PowerShell, ...) a brand-new console window that pops open and closes again.
`hide_child_consoles()` makes such children start with CREATE_NO_WINDOW instead. It only applies when the
process has no console, and only when the caller did not choose creationflags itself, so anything that
explicitly asks for a window (e.g. `start` for an app the Governor launches) still gets one.
"""

import subprocess
import sys

_installed = False


def hide_child_consoles() -> bool:
    """Installs the patch; returns True when it is active."""
    global _installed
    if _installed or sys.platform != "win32":
        return _installed
    try:
        import ctypes
        if ctypes.windll.kernel32.GetConsoleWindow():
            return False  # started from a terminal: children share it and nothing flashes
    except Exception:
        return False

    no_window = subprocess.CREATE_NO_WINDOW
    original_init = subprocess.Popen.__init__

    def __init__(self, *args, **kwargs):
        if not kwargs.get("creationflags"):
            kwargs["creationflags"] = no_window
        original_init(self, *args, **kwargs)

    subprocess.Popen.__init__ = __init__  # asyncio's Windows subprocesses build on Popen too
    _installed = True
    return True
