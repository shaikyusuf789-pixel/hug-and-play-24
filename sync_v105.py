import os
import requests
import base64
from pathlib import Path

# Configuration
GITHUB_PAT = os.environ.get("GITHUB_PAT")
REPO_OWNER = "shaikyusuf789-pixel"
REPO_NAME = "sky-annotations-worker"
BRANCH = "main"

def push_file_to_github(file_path, github_path, commit_message):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/{github_path}"
    headers = {
        "Authorization": f"token {GITHUB_PAT}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # Get current file if exists (to get the sha)
    response = requests.get(url, headers=headers)
    sha = None
    if response.status_code == 200:
        sha = response.json().get("sha")
    
    with open(file_path, "rb") as f:
        content = base64.b64encode(f.read()).decode("utf-8")
    
    data = {
        "message": commit_message,
        "content": content,
        "branch": BRANCH
    }
    if sha:
        data["sha"] = sha
        
    response = requests.put(url, headers=headers, json=data)
    if response.status_code in [200, 201]:
        print(f"Successfully pushed {github_path}")
    else:
        print(f"Failed to push {github_path}: {response.status_code} - {response.text}")

def sync_project():
    # Files to sync (relative to project root)
    files_to_sync = [
        "railway-worker/main.py",
        "railway-worker/workers/ai_annotations.py",
    ]
    
    for file_path in files_to_sync:
        if os.path.exists(file_path):
            push_file_to_github(file_path, file_path.replace("railway-worker/", ""), f"Version bump to v1.0.5 - fresh client per request")
        else:
            print(f"File {file_path} does not exist, skipping.")

if __name__ == "__main__":
    if not GITHUB_PAT:
        print("GITHUB_PAT not found in environment variables.")
    else:
        sync_project()
