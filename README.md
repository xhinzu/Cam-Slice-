# 🍉 Fruit Slice Live - Webcam Gesture Slicing Game

**Fruit Slice Live** is a real-time webcam gesture fruit-slicing game powered by **Google MediaPipe Tasks Vision (`HandLandmarker`)**, HTML5 Canvas, Vanilla JS/Vite, and **Vercel KV (Redis)** serverless API functions.

The player sees themselves live on camera as the game arena. Fruits and bombs fall from the top of the screen, and the player slices them in mid-air using their **index finger** tracked live in real-time.

---

## 🌟 Key Features 🌟

- 🖐️ **Real-Time Index Finger Tracking**: Powered client-side by Google MediaPipe HandLandmarker. Supports dual hands with automatic camera horizontal mirroring.
- ⚡ **Enhanced Gesture Accuracy**: Exponential position smoothing (EMA), multi-joint finger blade vectors, tuned velocity thresholding, and glowing neon trail flare effects.
- 🍉 **Rich Fruit Physics & Half-Split Visuals**: Falling fruits (🍎🍊🍋🍉🍇🍓🍍🍑🥝🥑) split into rotating half-cut pieces accompanied by vibrant juice particle splatter explosions.
- 💣 **Hazardous Bombs & Screen Shake**: Slicing a bomb triggers screen shake, red flash visual effects, explosive audio, and instant game over.
- 🏆 **Vercel KV Public Leaderboard**: Powered by `@vercel/kv` Redis sorted set (`ZADD` / `ZRANGE`) via `/api/submit-score` and `/api/leaderboard` serverless API functions. Built-in local storage fallback when unconfigured or offline.
- 🎵 **Web Audio API Procedural Synthesizer**: Custom sound effects for slicing, splatting, bombs, combos, and game over with zero external MP3 dependencies.
