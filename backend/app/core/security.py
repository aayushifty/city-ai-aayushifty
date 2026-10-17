"""FORGE AI Security Engine: Path Sandboxing, Command Policies, and Secret Masking."""

import re
import shlex
from pathlib import Path
from typing import List, Optional

class SecurityViolationError(Exception):
    """Raised when an operation breaches safety, boundary, or authorization policies."""
    pass

class SecurityEngine:
    """Enforces execution boundaries, command sandboxing, and data loss prevention."""
    
    SECRET_PATTERNS = [
        re.compile(r"(sk-[a-zA-Z0-9]{20,})", re.IGNORECASE),
        re.compile(r"(AIza[0-9A-Za-z-_]{35})", re.IGNORECASE),
        re.compile(r"(ghp_[a-zA-Z0-9]{36})", re.IGNORECASE),
        re.compile(r"(Bearer\s+[a-zA-Z0-9_\-\.]{20,})", re.IGNORECASE),
        re.compile(r"(password\s*[:=]\s*['\"][^'\"]+['\"])", re.IGNORECASE),
        re.compile(r"(api[_-]?key\s*[:=]\s*['\"][^'\"]+['\"])", re.IGNORECASE),
    ]

    DANGEROUS_COMMAND_SUBSTRINGS = [
        "rmdir /s /q c:\\", "del /f /s /q c:\\", "format ", "diskpart", 
        "drop database", "mkfs", "dd if=", ":(){ :|:& };:", "shutdown /",
        "poweroff", "reboot", "takeown", "icacls /grant"
    ]

    ALLOWED_PREFIXES = [
        "python", "pytest", "ruff", "node", "npm", "git", "echo", "cat", 
        "dir", "type", "mkdir", "touch", "ls", "pip"
    ]

    # Host commands the agents may never run, even with full computer access: they destroy disks,
    # the OS or whole profiles and cannot be undone.
    CATASTROPHIC_PATTERNS = [
        re.compile(r"\bformat(\.com)?\s+[a-z]:", re.IGNORECASE),
        re.compile(r"\b(diskpart|clear-disk|initialize-disk|remove-partition|format-volume)\b", re.IGNORECASE),
        re.compile(r"\bbcdedit\b", re.IGNORECASE),
        re.compile(r"\bvssadmin\b.*\bdelete\b", re.IGNORECASE),
        re.compile(r"\bcipher\s+/w", re.IGNORECASE),
        re.compile(r"\breg(\.exe)?\s+delete\s+hklm", re.IGNORECASE),
        re.compile(r"\bmkfs\b|\bdd\s+if=.*of=/dev/", re.IGNORECASE),
        re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:"),
        # Recursive deletes aimed at a drive root, Windows, Program Files, the Users folder or a whole profile.
        re.compile(
            r"\b(rm|rmdir|rd|del|erase|remove-item|ri)\b[^|;&]*?"
            r"(\s|['\"])([a-z]:\\?(\*)?|[a-z]:\\(windows|program files( \(x86\))?|programdata|users)(\\[^\\\s'\"]+)?\\?(\*)?|~|\$env:userprofile|%userprofile%|/)(['\"])?(\s+-{1,2}\w+)*\s*($|[|;&])",
            re.IGNORECASE,
        ),
    ]

    @classmethod
    def check_host_command(cls, command: str) -> None:
        """Raises SecurityViolationError for the small set of irreversible, system-destroying commands."""
        for pattern in cls.CATASTROPHIC_PATTERNS:
            if pattern.search(command):
                raise SecurityViolationError(
                    "Blocked: this command could wipe a disk, the operating system or a whole user profile. "
                    "Run it yourself if you really intend to."
                )

    @classmethod
    def validate_path_in_workspace(cls, target_path: Path | str, workspace_root: Path | str) -> Path:
        """Ensures target_path resolves strictly inside workspace_root."""
        ws = Path(workspace_root).resolve()
        target = Path(target_path)
        if not target.is_absolute():
            resolved = (ws / target).resolve()
        else:
            resolved = target.resolve()
            
        try:
            is_inside = resolved.is_relative_to(ws)
        except AttributeError:
            is_inside = str(resolved).startswith(str(ws))

        if not is_inside:
            raise SecurityViolationError(
                f"Path traversal blocked: target '{target_path}' resolves outside workspace '{workspace_root}'"
            )
        return resolved

    @classmethod
    def validate_command_policy(cls, command: str) -> None:
        """Validates shell command against security whitelist and blocks prohibited patterns."""
        normalized = command.strip().lower()
        
        for dangerous in cls.DANGEROUS_COMMAND_SUBSTRINGS:
            if dangerous in normalized:
                raise SecurityViolationError(
                    f"Command contains prohibited dangerous substring: '{dangerous}'"
                )
                
        try:
            tokens = shlex.split(command, posix=False)
        except Exception:
            tokens = command.split()
            
        if not tokens:
            raise SecurityViolationError("Empty command is not executable")
            
        executable = Path(tokens[0]).name.lower()
        if executable.endswith(".exe"):
            executable = executable[:-4]
            
        if executable not in cls.ALLOWED_PREFIXES:
            raise SecurityViolationError(
                f"Command executable '{tokens[0]}' is not in the allowed policy whitelist: {cls.ALLOWED_PREFIXES}"
            )

    @classmethod
    def redact_secrets(cls, text: str) -> str:
        """Masks detected API keys, passwords, and tokens with [REDACTED]."""
        if not text:
            return text
        sanitized = text
        for pattern in cls.SECRET_PATTERNS:
            sanitized = pattern.sub("[REDACTED_SECRET]", sanitized)
        return sanitized

    @classmethod
    def is_consequential_operation(cls, operation_type: str, details: dict) -> bool:
        """Determines if an operation requires explicit user authorization."""
        consequential_ops = {"deploy", "publish", "delete_workspace", "external_api_call", "git_push"}
        return operation_type.lower() in consequential_ops
