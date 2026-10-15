#!/usr/bin/env python3
"""Stage the static site for Pages without changing its original publication URLs."""

import argparse
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import unquote, urlsplit, urlunsplit


ORIGINAL_URL = "https://synthesis-space-time.progmetalhero.chatgpt.site"
ROOT_EXTENSIONS = {".html", ".css", ".js", ".xml", ".txt"}
ROOT_FILES = {"hero-cosmos.png", "hero-cosmos.webp", "LICENSE"}
PUBLIC_DIRECTORIES = ("articles", "assets", "issues")
MARKER_NAME = ".synthesis-pages-output"
MARKER_CONTENT = "Synthesis-Space-Time Pages artifact, format 1\n"
ORIGINAL_URL_PATTERN = re.compile(
    re.escape(ORIGINAL_URL) + r"(?=$|[/?#\s<>\"'])[^\s<>\"']*"
)
GUID_PATTERN = re.compile(r"(<guid\b[^>]*>)(.*?)(</guid\s*>)", re.DOTALL)
ROOT_ATTRIBUTE_PATTERN = re.compile(r"(\b(?:href|src)\s*=\s*)([\"'])(/[^\"']*)\2", re.IGNORECASE)


class BuildError(ValueError):
    """An input or output path is unsafe or unsupported."""


def normalize_base_url(value):
    value = value.strip().rstrip("/")
    if any(character.isspace() or character in "\"'<>\\" for character in value):
        raise BuildError("base URL contains unsupported characters")
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError as error:
        raise BuildError("base URL is invalid") from error
    if (parsed.scheme not in {"https", "http"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise BuildError("base URL must be an HTTP(S) site URL without credentials, query or fragment")
    if "//" in parsed.path or any(part in {".", ".."} for part in unquote(parsed.path).split("/")):
        raise BuildError("base URL path must not contain traversal or empty segments")
    return value


def public_files(source_root):
    """Allow public site formats at root, article HTML and the two asset trees."""
    files = []
    for path in sorted(source_root.iterdir()):
        if path.name.startswith("."):
            continue
        if path.suffix in ROOT_EXTENSIONS or path.name in ROOT_FILES:
            if path.is_symlink():
                raise BuildError(f"public input must not be a symlink: {path.name}")
            if path.is_file():
                files.append(path)
    for name in PUBLIC_DIRECTORIES:
        directory = source_root / name
        if directory.is_symlink():
            raise BuildError(f"public directory must not be a symlink: {name}")
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(directory)
            if any(part.startswith(".") for part in relative.parts):
                continue
            if path.is_symlink():
                raise BuildError(f"public input must not be a symlink: {path.relative_to(source_root)}")
            if path.is_file() and (name != "articles" or path.suffix == ".html"):
                files.append(path)
    if source_root / "index.html" not in files:
        raise BuildError("source root must contain a public index.html")
    return sorted(files)


def validate_output(output_dir, source_root, inputs):
    output_dir = Path(output_dir).expanduser()
    if not output_dir.is_absolute():
        output_dir = source_root / output_dir
    if output_dir.is_symlink():
        raise BuildError("output directory must not be a symlink")
    output_dir = output_dir.resolve()
    if output_dir == source_root or output_dir in source_root.parents:
        raise BuildError("output must not be the checkout or one of its ancestors")
    for name in PUBLIC_DIRECTORIES:
        directory = source_root / name
        if output_dir == directory or directory in output_dir.parents:
            raise BuildError("output must not overlap a public source directory")
    for path in inputs:
        if output_dir == path or output_dir in path.parents or path in output_dir.parents:
            raise BuildError("output must not overlap a public source input")
    if output_dir.exists():
        marker = output_dir / MARKER_NAME
        if (not output_dir.is_dir() or marker.is_symlink() or not marker.is_file()
                or marker.read_text(encoding="utf-8") != MARKER_CONTENT):
            raise BuildError("existing output is not a generated Synthesis Pages artifact; choose a fresh directory")
    return output_dir


def rewrite_url(url, base_url, html_paths):
    suffix = url[len(ORIGINAL_URL):]
    parsed = urlsplit(suffix)
    path = parsed.path or "/"
    if not Path(path).suffix:
        candidate = path.lstrip("/").rstrip("/") + ".html"
        if candidate in html_paths:
            path = "/" + candidate
    result = base_url + path
    return urlunsplit((*urlsplit(result)[:3], parsed.query, parsed.fragment))


def rewrite_text(text, base_url, html_paths, *, preserve_guids=False, is_404=False):
    def rewrite(part):
        return ORIGINAL_URL_PATTERN.sub(lambda match: rewrite_url(match.group(), base_url, html_paths), part)

    if preserve_guids:
        # Existing RSS identities remain stable when the feed moves to another host.
        parts = []
        position = 0
        for match in GUID_PATTERN.finditer(text):
            parts.extend((rewrite(text[position:match.start()]), match.group()))
            position = match.end()
        parts.append(rewrite(text[position:]))
        text = "".join(parts)
    else:
        text = rewrite(text)
    if is_404:
        # An absolute deployment URL also works on a deeply nested missing route.
        text = ROOT_ATTRIBUTE_PATTERN.sub(
            lambda match: (match[1] + match[2] + base_url + match[3] + match[2])
            if not match[3].startswith("//") else match.group(), text
        )
    return text


def _publish(staged, output_dir, source_root, inputs):
    """Copy complete staging to the destination filesystem before swapping directories."""
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    replacement = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.stage-", dir=output_dir.parent))
    backup = None
    try:
        shutil.copytree(staged, replacement, dirs_exist_ok=True)
        validate_output(output_dir, source_root, inputs)
        if output_dir.exists():
            backup = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.previous-", dir=output_dir.parent))
            backup.rmdir()
            output_dir.rename(backup)
        try:
            replacement.rename(output_dir)
        except OSError:
            if backup is not None:
                backup.rename(output_dir)
                backup = None
            raise
        if backup is not None:
            shutil.rmtree(backup)
    finally:
        if replacement.exists():
            shutil.rmtree(replacement)


def build_site(base_url, output_dir="_site", *, source_root=None):
    source_root = Path(source_root or Path(__file__).resolve().parents[1]).resolve()
    base_url = normalize_base_url(base_url)
    inputs = public_files(source_root)
    output_dir = validate_output(output_dir, source_root, inputs)
    html_paths = {path.relative_to(source_root).as_posix() for path in inputs if path.suffix == ".html"}
    # The first complete build is outside the checkout; source files are never rewritten.
    temporary_root = Path(tempfile.gettempdir()).resolve()
    if temporary_root == source_root or source_root in temporary_root.parents:
        raise BuildError("temporary directory must be outside the checkout")
    with tempfile.TemporaryDirectory(prefix="synthesis-pages-", dir=temporary_root) as temporary:
        staged = Path(temporary)
        for path in inputs:
            relative = path.relative_to(source_root)
            destination = staged / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if path.suffix in {".html", ".xml"} or relative == Path("robots.txt"):
                text = rewrite_text(path.read_text(encoding="utf-8"), base_url, html_paths,
                                    preserve_guids=relative == Path("feed.xml"),
                                    is_404=relative == Path("404.html"))
                destination.write_text(text, encoding="utf-8", newline="")
            else:
                shutil.copyfile(path, destination)
        (staged / ".nojekyll").write_bytes(b"")
        (staged / MARKER_NAME).write_text(MARKER_CONTENT, encoding="utf-8")
        # Normalize public permissions and timestamps; output contains no build clock or local paths.
        for path in sorted(staged.rglob("*"), reverse=True):
            path.chmod(0o755 if path.is_dir() else 0o644)
            os.utime(path, (0, 0))
        staged.chmod(0o755)
        os.utime(staged, (0, 0))
        _publish(staged, output_dir, source_root, inputs)
    return output_dir


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Published site URL, including a Pages project path when applicable")
    parser.add_argument("--output-dir", default="_site", help="Fresh or previously generated artifact directory (default: _site)")
    arguments = parser.parse_args(argv)
    try:
        output = build_site(arguments.base_url, arguments.output_dir)
    except (BuildError, OSError, UnicodeError) as error:
        parser.exit(1, f"build_pages: {error}\n")
    print(f"Built Pages artifact: {output}")


if __name__ == "__main__":
    main()
