from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parent.parent
files=json.loads((root/'PUBLIC_FILES.json').read_text())
if len({f.casefold() for f in files})!=len(files):raise ValueError('Case-colliding public paths')
with zipfile.ZipFile(Path(__file__).parent/'dist/battery-pilot-kit.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in files:
  path=root/name
  if name=='site/dist/battery-pilot-kit.zip' or not path.is_file() or not path.resolve().is_relative_to(root.resolve()):raise ValueError('Invalid public manifest entry')
  if any(part in ['live-state','devnet-state','mainnet-state','paid-state','reference','artifacts','pilot-state','.vercel','node_modules'] for part in path.relative_to(root).parts) or any(part.startswith('.env') for part in path.relative_to(root).parts):raise ValueError('Private state in manifest')
  z.write(path,name)
 assert z.testzip() is None
print(f'Source kit: {len(files)} allowlisted files, no private runtime state or keys.')
