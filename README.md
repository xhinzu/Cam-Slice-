# 🍉 Fruit Slice Live - Webcam Gesture Slicing Game

**Fruit Slice Live** is a real-time webcam gesture fruit-slicing game powered by **Google MediaPipe Tasks Vision (`HandLandmarker`)**, HTML5 Canvas, Vanilla JS/Vite, and **Vercel KV (Redis)** serverless API functions.

The player sees themselves live on camera as the game arena. Fruits and bombs fall from the top of the screen, and the player slices them in mid-air using their **index finger** tracked live in real-time.

---

## 🌟 Key Features

- 🖐️ **Real-Time Index Finger Tracking**: Powered client-side by Google MediaPipe HandLandmarker. Supports dual hands with automatic camera horizontal mirroring.
- ⚡ **Enhanced Gesture Accuracy**: Exponential position smoothing (EMA), multi-joint finger blade vectors, tuned velocity thresholding, and glowing neon trail flare effects.
- 🍉 **Rich Fruit Physics & Half-Split Visuals**: Falling fruits (🍎🍊🍋🍉🍇🍓🍍🍑🥝🥑) split into rotating half-cut pieces accompanied by vibrant juice particle splatter explosions.
- 💣 **Hazardous Bombs & Screen Shake**: Slicing a bomb triggers screen shake, red flash visual effects, explosive audio, and instant game over.
- 🏆 **Vercel KV Public Leaderboard**: Powered by `@vercel/kv` Redis sorted set (`ZADD` / `ZRANGE`) via `/api/submit-score` and `/api/leaderboard` serverless API functions. Built-in local storage fallback when unconfigured or offline.
- 🎵 **Web Audio API Procedural Synthesizer**: Custom sound effects for slicing, splatting, bombs, combos, and game over with zero external MP3 dependencies.

---

## 🚀 Quick Start (Running Locally)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)

### 1. Install Dependencies
```bash
cd fruit-slice-live
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in a modern browser (Chrome, Edge, Firefox, or Safari), grant camera permissions, and start slicing!

---

## 🌩️ Deploying to Vercel with Public Leaderboard

### Step 1: Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit: Fruit Slice Live with Vercel KV Leaderboard"

# Create a new repository on GitHub (or use gh repo create fruit-slice-live --public --source=. --remote=origin)
git remote add origin https://github.com/YOUR_USERNAME/fruit-slice-live.git
git branch -M main
git push -u origin main
```

### Step 2: Import Project on Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your `fruit-slice-live` repository and click **Import**.
3. Leave build settings as auto-detected (Vite / Output `dist`).
4. Click **Deploy**.

### Step 3: Add Vercel KV (Redis) Storage
1. In your Vercel project dashboard, navigate to the **Storage** tab.
2. Click **Create Database** ➔ choose **KV** (Redis).
3. Name it (e.g., `fruit-slice-leaderboard`) and click **Create**.
4. Click **Connect to Project** to connect it to `fruit-slice-live`. This automatically provisions `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `KV_REST_API_READ_ONLY_TOKEN`.
5. Go to **Deployments** ➔ select the latest deployment ➔ click **Redeploy**.

---

## ⚡ Serverless API Endpoints

- **`POST /api/submit-score`**: Accepts `{ name, score }`, validates constraints (name $\le 20$ chars, score $0-9999$), and executes `zadd('leaderboard', { score, member: name })`.
- **`GET /api/leaderboard`**: Queries top-10 sorted scores using `kv.zrange('leaderboard', 0, 9, { rev: true, withScores: true })` and returns `[{ name, score }, ...]`.

---

## 🛠️ Project Structure

```
/fruit-slice-live
├── api/
│   ├── submit-score.js        -> Vercel serverless function (POST score to Vercel KV)
│   └── leaderboard.js         -> Vercel serverless function (GET top-10 scores)
├── index.html                 -> Main layout, video/canvas overlay, modal overlays
├── package.json               -> Vite, @mediapipe/tasks-vision, @vercel/kv
├── vercel.json                -> Vercel build & route rewrite configuration
├── .env.example               -> Vercel KV environment variables reference
├── .gitignore                 -> Excluded build artifacts & secrets
├── README.md                  -> Deployment & local running documentation
└── src/
    ├── main.js                -> App bootstrap & state machine
    ├── camera.js              -> Webcam stream initialization & mirroring
    ├── handTracker.js         -> MediaPipe HandLandmarker, fingertip tracking & blade trails
    ├── fruit.js               -> Fruit, Bomb, SlicedHalf, and Particle physics entities
    ├── game.js                -> Core game loop, collision detection, spawning & lives system
    ├── leaderboard.js         -> Vercel KV API client & local storage fallback
    ├── ui.js                  -> Glassmorphism UI modal controller & HUD updates
    ├── audio.js               -> Web Audio API sound synthesizer
    └── style.css              -> Dark glassmorphism styles & animations
```
