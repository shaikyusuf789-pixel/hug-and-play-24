import os
import subprocess
import requests
import json
import base64

def push_to_github():
    pat = os.environ.get("GITHUB_PAT")
    if not pat:
        print("GITHUB_PAT not found")
        return

    repo = "shaikyusuf789-pixel/sky-annotations-worker"
    branch = "main"
    
    # 1. Get current tree
    base_url = f"https://api.github.com/repos/{repo}"
    headers = {
        "Authorization": f"token {pat}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # Get latest commit SHA
    res = requests.get(f"{base_url}/branches/{branch}", headers=headers)
    latest_commit_sha = res.json()["commit"]["sha"]
    
    # Get the tree SHA
    res = requests.get(f"{base_url}/commits/{latest_commit_sha}", headers=headers)
    base_tree_sha = res.json()["commit"]["tree"]["sha"]
    
    # 2. Create blobs and build tree
    files_to_push = []
    excluded_dirs = {"__pycache__", ".git", "venv", "node_modules"}
    excluded_files = {".env"}
    
    for root, dirs, files in os.walk("railway-worker"):
        # Remove excluded dirs from walk
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        
        for file in files:
            if file not in excluded_files:
                files_to_push.append(os.path.join(root, file))
    
    tree_items = []
    for f in files_to_push:
        with open(f, "rb") as file:
            content = file.read()
            # Create blob
            res = requests.post(f"{base_url}/git/blobs", headers=headers, json={
                "content": base64.b64encode(content).decode("utf-8"),
                "encoding": "base64"
            })
            blob_sha = res.json()["sha"]
            
            # Map path in repo (strip railway-worker/ prefix for the root of the worker repo)
            repo_path = f.replace("railway-worker/", "")
            tree_items.append({
                "path": repo_path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha
            })
            
    # 3. Create new tree
    res = requests.post(f"{base_url}/git/trees", headers=headers, json={
        "base_tree": base_tree_sha,
        "tree": tree_items
    })
    new_tree_sha = res.json()["sha"]
    
    # 4. Create commit
    res = requests.post(f"{base_url}/git/commits", headers=headers, json={
        "message": "Fix: Reduce annotation pen stroke width to 50%",
        "tree": new_tree_sha,
        "parents": [latest_commit_sha]
    })
    new_commit_sha = res.json()["sha"]
    
    # 5. Update branch reference
    res = requests.patch(f"{base_url}/git/refs/heads/{branch}", headers=headers, json={
        "sha": new_commit_sha
    })
    
    print(f"Pushed commit {new_commit_sha} to {branch}")

if __name__ == "__main__":
    push_to_github()
