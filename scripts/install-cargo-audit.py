import urllib.request
import json
import zipfile
import os
import shutil

print('Fetching release info...')
api_url = 'https://api.github.com/repos/rustsec/rustsec/releases/latest'
req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())

download_url = None
for asset in data['assets']:
    if 'cargo-audit' in asset['name'] and 'x86_64-pc-windows-msvc' in asset['name']:
        download_url = asset['browser_download_url']
        break

if not download_url:
    print('Could not find Windows binary asset.')
    exit(1)

print(f'Downloading from {download_url}...')
urllib.request.urlretrieve(download_url, 'cargo-audit.zip')

print('Extracting...')
with zipfile.ZipFile('cargo-audit.zip', 'r') as zip_ref:
    zip_ref.extractall('cargo-audit')

dest = os.path.join(os.environ['USERPROFILE'], '.cargo', 'bin')
os.makedirs(dest, exist_ok=True)
for root, _, files in os.walk('cargo-audit'):
    for file in files:
        if file == 'cargo-audit.exe':
            shutil.copy(os.path.join(root, file), dest)
            print('Installed!')
            exit(0)
print('Failed to find cargo-audit.exe in zip.')
