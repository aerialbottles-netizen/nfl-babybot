# 🏈 NFL BabyBot 2025 — Live

Static website that pulls **defensive allowances** (rushing TDs allowed, passing TDs allowed, red‑zone TD%) from a nightly‑built JSON, and uses those numbers to shape **anytime TD picks** and implied points.

## Layout
```
web/                  # Frontend UI
  index.html
  styles.css
  app.js
scripts/
  build_defs.py       # Nightly data builder (nflverse play-by-play -> data/defs_2025.json)
data/
  defs_2025.json      # Generated file (committed nightly)
.github/workflows/
  nightly.yml         # GitHub Actions workflow that rebuilds JSON every day
```

## Setup
1. Create a new GitHub repo and upload **all** files.
2. Edit `web/index.html` and set:
   ```html
   <script>
     window.DEFS_JSON_URL = "https://raw.githubusercontent.com/<your-username>/<your-repo>/main/data/defs_2025.json";
   </script>
   ```
3. Push to GitHub → **Actions** tab → enable workflows (if prompted).
4. Deploy the `/web` folder to **Vercel** (Root Directory = `web/`).

## Local build (optional)
```bash
cd scripts
python build_defs.py
# writes ../data/defs_2025.json
```

This keeps the site simple: the browser only fetches one small JSON, and the data is refreshed once per day by GitHub Actions.
