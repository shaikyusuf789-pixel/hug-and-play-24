import os
import requests
import base64

def pull_from_github():
    pat = os.environ.get("GITHUB_PAT")
    if not pat:
        print("GITHUB_PAT not found")
        return

    repo = "shaikyusuf789-pixel/sky-annotations-worker"
    branch = "main"
    base_url = f"https://api.github.com/repos/{repo}"
    headers = {
        "Authorization": f"token {pat}",
        "Accept": "application/vnd.github.v3+json"
    }

    # 1. Get the latest commit SHA to find the tree
    res = requests.get(f"{base_url}/branches/{branch}", headers=headers)
    if res.status_code != 200:
        print(f"Error fetching branch: {res.text}")
        return
    
    tree_sha = res.json()["commit"]["commit"]["tree"]["sha"]

    # 2. Get the recursive tree
    res = requests.get(f"{base_url}/git/trees/{tree_sha}?recursive=1", headers=headers)
    if res.status_code != 200:
        print(f"Error fetching tree: {res.text}")
        return
    
    tree = res.json()["tree"]
    
    local_root = "railway-worker"
    if not os.path.exists(local_root):
        os.makedirs(local_root)

    for item in tree:
        path = item["path"]
        type = item["type"]
        
        local_path = os.path.join(local_root, path)
        
        if type == "tree":
            if not os.path.exists(local_path):
                os.makedirs(local_path)
            continue
        
        if type == "blob":
            # 3. Get the blob content
            print(f"Downloading {path}...")
            blob_res = requests.get(f"{base_url}/git/blobs/{item['sha']}", headers=headers)
            if blob_res.status_code == 200:
                content_base64 = blob_res.json()["content"]
                # GitHub blobs are often base64 encoded with newlines
                content = base64.b64decode(content_base64.replace("\n", ""))
                
                # Ensure parent directory exists
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                
                with open(local_path, "wb") as f:
                    f.write(content)
            else:
                print(f"Error downloading {path}: {blob_res.text}")

    print("Successfully pulled and replaced all files in railway-worker/")

if __name__ == "__main__":
    pull_from_github()
