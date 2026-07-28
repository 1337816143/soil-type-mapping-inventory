#!/usr/bin/env python3
"""Build a compact repository tree manifest for the static GitHub Pages site.

In GitHub Actions the script uses the authenticated GITHUB_TOKEN once at build
 time. Public browsers then read the generated same-origin JSON file and no
longer call the unauthenticated GitHub Tree API.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MANAGED_PREFIXES = (
    "reference-files/third-soil-survey/",
    "replies/",
    "data/质控意见反馈_管理员导入/",
)
MANAGED_FILES = {"data/admin-import-index.json"}


def keep(path: str) -> bool:
    return path in MANAGED_FILES or any(path.startswith(prefix) for prefix in MANAGED_PREFIXES)


def github_tree() -> tuple[list[dict[str, Any]], str]:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    sha = os.environ.get("GITHUB_SHA", "").strip() or "HEAD"
    if not token or not repository:
        raise RuntimeError("GitHub Actions authentication is unavailable")

    url = f"https://api.github.com/repos/{repository}/git/trees/{sha}?recursive=1"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "soil-type-mapping-inventory-pages-build",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get("truncated"):
        raise RuntimeError("GitHub recursive tree response was truncated")
    return list(payload.get("tree") or []), sha


def local_tree() -> tuple[list[dict[str, Any]], str]:
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    output = subprocess.check_output(
        ["git", "ls-tree", "-r", "-l", "HEAD"], text=True, errors="replace"
    )
    entries: list[dict[str, Any]] = []
    for line in output.splitlines():
        metadata, path = line.split("\t", 1)
        mode, kind, object_sha, size_text = metadata.split(maxsplit=3)
        entries.append(
            {
                "path": path,
                "mode": mode,
                "type": kind,
                "sha": object_sha,
                "size": int(size_text) if size_text.isdigit() else 0,
            }
        )
    return entries, sha


def include_parent_directories(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    directories: set[str] = set()
    for entry in entries:
        parts = str(entry.get("path") or "").split("/")
        for index in range(1, len(parts)):
            directories.add("/".join(parts[:index]))

    existing = {str(entry.get("path") or "") for entry in entries}
    for directory in sorted(directories):
        if directory not in existing:
            entries.append({"path": directory, "mode": "040000", "type": "tree", "sha": ""})
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/repository-tree.json")
    args = parser.parse_args()

    try:
        tree, source_sha = github_tree()
        source = "authenticated-github-tree-api"
    except Exception as error:  # Local development and validation fallback.
        print(f"Authenticated tree API unavailable, using local git tree: {error}")
        tree, source_sha = local_tree()
        source = "local-git-tree"

    filtered = [
        {
            "path": str(entry.get("path") or ""),
            "mode": str(entry.get("mode") or "100644"),
            "type": str(entry.get("type") or "blob"),
            "sha": str(entry.get("sha") or ""),
            "size": int(entry.get("size") or 0),
        }
        for entry in tree
        if keep(str(entry.get("path") or ""))
    ]
    filtered = include_parent_directories(filtered)
    filtered.sort(key=lambda entry: (entry["path"], entry["type"]))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "appVersion": Path("VERSION").read_text(encoding="utf-8").strip(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "sourceSha": source_sha,
        "tree": filtered,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(filtered)} managed tree entries to {output}")


if __name__ == "__main__":
    main()
