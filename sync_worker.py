import os
import base64
import json
import requests

GITHUB_PAT = os.environ.get("GITHUB_PAT")
REPO = "shaikyusuf789-pixel/sky-annotations-worker"
BASE_URL = f"https://api.github.com/repos/{REPO}/contents"

headers = {
    "Authorization": f"token {GITHUB_PAT}",
    "Accept": "application/vnd.github.v3+json",
}

def update_file(path, local_path, commit_message):
    # Get current SHA
    resp = requests.get(f"{BASE_URL}/{path}", headers=headers)
    if resp.status_code == 200:
        sha = resp.json()["sha"]
        print(f"Found {path} with SHA {sha}")
    elif resp.status_code == 404:
        sha = None
        print(f"{path} not found, will create new file")
    else:
        print(f"Error fetching {path}: {resp.status_code} {resp.text}")
        return

    # Read local content
    with open(local_path, "rb") as f:
        content = base64.b64encode(f.read()).decode("utf-8")

    # Update/Create
    data = {
        "message": commit_message,
        "content": content,
        "branch": "main"
    }
    if sha:
        data["sha"] = sha

    resp = requests.put(f"{BASE_URL}/{path}", headers=headers, json=data)
    if resp.status_code in (200, 201):
        print(f"Successfully updated {path}")
    else:
        print(f"Error updating {path}: {resp.status_code} {resp.text}")

# List of files to sync from railway-worker/ to repo root
files_to_sync = [
    ("requirements.txt", "railway-worker/requirements.txt"),
    ("main.py", "railway-worker/main.py"),
    ("railway.toml", "railway-worker/railway.toml"),
    ("Dockerfile", "railway-worker/Dockerfile"),
    ("workers/render.py", "railway-worker/workers/render.py"),
    ("workers/ocr.py", "railway-worker/workers/ocr.py"),
    ("workers/timestamps.py", "railway-worker/workers/timestamps.py"),
    ("lib/storage.py", "railway-worker/lib/storage.py"),
    ("lib/supabase_client.py", "railway-worker/lib/supabase_client.py"),
    ("lib/config.py", "railway-worker/lib/config.py"),
]

for remote_path, local_path in files_to_sync:
    if os.path.exists(local_path):
        update_file(remote_path, local_path, f"Sync {remote_path} from Lovable")
    else:
        print(f"Local file {local_path} does not exist, skipping.")
