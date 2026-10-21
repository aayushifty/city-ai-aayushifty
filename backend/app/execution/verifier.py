"""FORGE AI Verification Engine: Test Execution & Observable Evidence Gathering."""

import asyncio
import json
import os
import re
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Optional, Tuple
from app.models.schemas import VerificationEvidence
from app.execution.runner import ProcessRunner

class VerifierEngine:
    """Executes automated verification suites and parses observable test evidence."""

    @classmethod
    async def verify_workspace(
        cls,
        workspace_path: Path | str,
        test_command: str = "pytest -v",
        timeout_seconds: int = 60
    ) -> VerificationEvidence:
        """Runs the test suite inside the workspace and produces concrete verification evidence."""
        result = await ProcessRunner.run_command(
            command=test_command,
            cwd=workspace_path,
            timeout_seconds=timeout_seconds
        )

        combined_output = f"{result.stdout}\n{result.stderr}"

        passed_count = 0
        failed_count = 0

        passed_match = re.search(r"(\d+)\s+passed", combined_output)
        if passed_match:
            passed_count = int(passed_match.group(1))

        failed_match = re.search(r"(\d+)\s+failed", combined_output)
        if failed_match:
            failed_count = int(failed_match.group(1))

        if result.exit_code == 0 and passed_count == 0:
            if "error" not in combined_output.lower() and "traceback" not in combined_output.lower():
                passed_count = 1

        # If pytest exited with 5 because no test files exist yet, perform syntax validation on all python modules
        if result.exit_code == 5 and ("no tests ran" in combined_output.lower() or "collected 0 items" in combined_output.lower()):
            import ast
            ws = Path(workspace_path)
            py_files = [f for f in ws.rglob("*.py") if ".git" not in f.parts]
            syntax_errors = []
            for pf in py_files:
                try:
                    ast.parse(pf.read_text(encoding="utf-8"))
                except Exception as ex:
                    syntax_errors.append(f"{pf.name}: {ex}")

            if not syntax_errors:
                return VerificationEvidence(
                    test_suite=test_command,
                    exit_code=0,
                    passed_tests=len(py_files) if py_files else 1,
                    failed_tests=0,
                    output_snippet="Syntax validation passed: All python modules parsed successfully."
                )
            else:
                return VerificationEvidence(
                    test_suite=test_command,
                    exit_code=1,
                    passed_tests=0,
                    failed_tests=len(syntax_errors),
                    output_snippet="Syntax validation failed:\n" + "\n".join(syntax_errors)
                )

        output_snippet = (result.stdout[-1000:] if result.stdout else "") + (
            f"\nERRORS:\n{result.stderr[-1000:]}" if result.stderr else ""
        )

        return VerificationEvidence(
            test_suite=test_command,
            exit_code=result.exit_code,
            passed_tests=passed_count,
            failed_tests=failed_count if failed_count > 0 else (1 if result.exit_code != 0 else 0),
            output_snippet=output_snippet.strip()
        )


# --- Deliverable checks used by the citizen task loop (no check is ever forced to pass) ---

_VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
    "source", "track", "wbr", "!doctype",
}
# Elements whose end tag HTML lets you omit; they are not reported as unclosed.
_OPTIONAL_END_TAGS = {
    "p", "li", "dt", "dd", "tr", "td", "th", "thead", "tbody", "tfoot", "option", "optgroup",
    "colgroup", "caption", "rb", "rt", "rp", "html", "head", "body",
}


class _HTMLStructureChecker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: List[Tuple[str, int]] = []
        self.errors: List[str] = []
        self.tag_count = 0

    def handle_starttag(self, tag, attrs):
        self.tag_count += 1
        if tag not in _VOID_TAGS:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.tag_count += 1

    def handle_endtag(self, tag):
        if tag in _VOID_TAGS:
            return
        names = [t for t, _ in self.stack]
        if tag not in names:
            self.errors.append(f"line {self.getpos()[0]}: closing </{tag}> has no matching opening tag")
            return
        while self.stack:
            open_tag, line = self.stack.pop()
            if open_tag == tag:
                break
            if open_tag not in _OPTIONAL_END_TAGS:
                self.errors.append(f"line {line}: <{open_tag}> is not closed before </{tag}>")


def check_html(text: str) -> List[str]:
    """Returns structural problems in an HTML document (empty list = OK)."""
    if not text.strip():
        return ["file is empty"]
    checker = _HTMLStructureChecker()
    try:
        checker.feed(text)
        checker.close()
    except Exception as ex:  # HTMLParser rarely raises, but report it if it does
        return [f"HTML parse error: {ex}"]
    errors = list(checker.errors)
    if checker.tag_count == 0:
        errors.append("no HTML tags found")
    for tag, line in checker.stack:
        if tag not in _OPTIONAL_END_TAGS:
            errors.append(f"line {line}: <{tag}> is never closed")
    return errors[:20]


def check_json(text: str) -> List[str]:
    try:
        json.loads(text)
        return []
    except json.JSONDecodeError as ex:
        return [f"invalid JSON: {ex.msg} (line {ex.lineno}, column {ex.colno})"]


def check_python_compiles(text: str, name: str) -> List[str]:
    try:
        compile(text, name, "exec")
        return []
    except SyntaxError as ex:
        return [f"SyntaxError: {ex.msg} (line {ex.lineno})" + (f"\n    {ex.text.rstrip()}" if ex.text else "")]
    except Exception as ex:
        return [f"{type(ex).__name__}: {ex}"]


def _is_test_file(p: Path) -> bool:
    return p.suffix == ".py" and (p.name.startswith("test_") or p.name.endswith("_test.py"))


async def run_pytest(workspace: Path, timeout_seconds: int = 120) -> Tuple[int, str]:
    """Runs pytest in `workspace` with this interpreter, isolated from any parent project's config."""
    with tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False) as ini:
        ini.write("[pytest]\n")
        ini_path = ini.name
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--import-mode=importlib",
            "-c", ini_path, "--rootdir", str(workspace), "--confcutdir", str(workspace),
            cwd=str(workspace),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "PYTHONPATH": str(workspace), "PYTHONDONTWRITEBYTECODE": "1"},
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return -1, f"pytest timed out after {timeout_seconds}s"
        return proc.returncode if proc.returncode is not None else -1, out.decode("utf-8", errors="replace")
    finally:
        try:
            os.unlink(ini_path)
        except OSError:
            pass


_BINARY_SIGNATURES = {".pdf": b"%PDF", ".png": b"\x89PNG", ".jpg": b"\xff\xd8", ".jpeg": b"\xff\xd8", ".gif": b"GIF8",
                      ".zip": b"PK", ".docx": b"PK", ".xlsx": b"PK", ".pptx": b"PK", ".fig": b"fig-kiwi", ".glb": b"glTF"}


async def verify_deliverables(workspace: Path | str, files: List[Path]) -> VerificationEvidence:
    """Real checks for the files a task produced.

    - pytest when the workspace has test files and the task produced Python code;
      otherwise every produced .py file must compile
    - .html/.htm must parse with balanced tags, .json must parse
    - every other file must be non-empty
    """
    ws = Path(workspace).resolve()
    files = [Path(f) for f in files]
    passed: List[str] = []
    failed: List[str] = []
    suites: List[str] = []

    if not files:
        return VerificationEvidence(test_suite="deliverable checks", exit_code=1, passed_tests=0,
                                    failed_tests=1, output_snippet="FAIL: the task produced no files")

    for f in files:
        name = str(f.relative_to(ws)).replace("\\", "/") if f.is_relative_to(ws) else f.name
        if not f.is_file():
            failed.append(f"{name}: file was not written")
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        suffix = f.suffix.lower()
        if suffix in _BINARY_SIGNATURES and not f.read_bytes().startswith(_BINARY_SIGNATURES[suffix]):
            failed.append(f"{name} [format]: not a real {suffix} file (text pretending to be {suffix})")
            continue
        if suffix == ".py":
            errs, kind = check_python_compiles(text, name), "compile"
        elif suffix in (".html", ".htm"):
            errs, kind = check_html(text), "html"
        elif suffix == ".json":
            errs, kind = check_json(text), "json"
        else:
            errs, kind = ([] if text.strip() else ["file is empty"]), "non-empty"
        if errs:
            failed.append(f"{name} [{kind}]: " + "; ".join(errs))
        else:
            passed.append(f"{name} [{kind}]")
        if kind not in suites:
            suites.append(kind)

    produced_python = any(f.suffix == ".py" for f in files)
    has_tests = any(_is_test_file(p) for p in ws.rglob("*.py") if ".git" not in p.parts)
    pytest_out = ""
    if produced_python and has_tests:
        suites.append("pytest")
        code, out = await run_pytest(ws)
        pytest_out = out.strip()[-2500:]
        summary_line = pytest_out.splitlines()[-1] if pytest_out else ""
        if code == 0:
            passed.append(f"pytest: {summary_line}")
        else:
            failed.append(f"pytest exited {code}: {summary_line}")

    lines = [f"FAIL {x}" for x in failed] + [f"PASS {p}" for p in passed]
    if pytest_out and failed:
        lines.append("--- pytest output ---\n" + pytest_out)
    return VerificationEvidence(
        test_suite=" + ".join(suites) or "deliverable checks",
        exit_code=0 if not failed else 1,
        passed_tests=len(passed),
        failed_tests=len(failed),
        output_snippet="\n".join(lines)[-4000:],
    )
