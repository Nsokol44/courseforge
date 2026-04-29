# CourseForge — Python Backend

A FastAPI backend that:
- Proxies all Anthropic API calls (your key lives on the server, never in the browser)
- Stores user accounts and courses persistently
- Serves the CourseForge frontend

---

## Files

```
courseforge-backend/
├── main.py            ← FastAPI app (API proxy + auth + course storage)
├── requirements.txt   ← Python dependencies
├── Procfile           ← How Railway starts the server
├── railway.toml       ← Railway configuration
├── courseforge.html   ← Updated frontend (point this at your Railway URL)
└── README.md
```

---

## Deploy to Railway (5 minutes)

### 1. Create a GitHub repo

```bash
git init
git add .
git commit -m "Initial CourseForge backend"
```

Create a new repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/courseforge-backend.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `courseforge-backend` repo
4. Railway will auto-detect Python and deploy

### 3. Set your Anthropic API key

In Railway, go to your project → **Variables** tab → click **New Variable**:

```
ANTHROPIC_API_KEY = sk-ant-your-key-here
```

Click **Deploy** — Railway will restart with the key set.

### 4. Get your Railway URL

In Railway, go to **Settings → Networking → Generate Domain**.  
You'll get a URL like: `https://courseforge-backend-production.up.railway.app`

### 5. Update the frontend

Open `courseforge.html` and find this line near the top of the `<script>` section:

```javascript
const BACKEND = window.COURSEFORGE_BACKEND || 'http://localhost:8000';
```

Change it to your Railway URL:

```javascript
const BACKEND = window.COURSEFORGE_BACKEND || 'https://courseforge-backend-production.up.railway.app';
```

Save the file. Now open `courseforge.html` in any browser — it will talk to your Railway backend.

---

## Run Locally (no Railway needed)

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Start the server
uvicorn main:app --reload --port 8000
```

Then open `courseforge.html` in your browser. The default `BACKEND` points to `localhost:8000` so it works out of the box.

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/signin` | Sign in, get token |
| POST | `/api/auth/signout` | Invalidate token |
| GET  | `/api/courses` | Load professor's courses |
| POST | `/api/courses` | Save professor's courses |
| POST | `/api/ai` | Proxy to Anthropic API |
| GET  | `/health` | Health check |

All `/api/courses` and `/api/ai` routes require `Authorization: Bearer <token>` header.

---

## Data Storage

Course data is stored in `data.json` in the project directory.  
On Railway, this file lives on the container — it persists as long as the deployment runs,  
but will reset if Railway rebuilds from scratch.

**For production-grade persistence**, add a Railway PostgreSQL plugin and swap  
`load_db`/`save_db` for database calls. The structure maps 1:1 to simple tables.

---

## Notes

- Sessions are in-memory tokens stored in `data.json` — they survive restarts
- Passwords are SHA-256 hashed (good for a prototype; use bcrypt for production)
- The Anthropic key is never sent to the browser at any point
# courseforge
