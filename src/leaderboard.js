/**
 * Leaderboard Module - Vercel KV Serverless API Integration & Local Storage Fallback.
 * Calls /api/leaderboard (GET) and /api/submit-score (POST).
 */

class LeaderboardManager {
  constructor() {
    this.localLeaderboardKey = 'fruit_slice_local_lb';
    this.personalBestKey = 'fruit_slice_pb';
    this.activeCallback = null;
    this.currentMode = 'fruit-slice';
  }

  /**
   * Subscribe / query top-10 leaderboard scores from /api/leaderboard or local storage.
   */
  async subscribeTopScores(callback, currentPlayerName = '', mode = 'fruit-slice') {
    this.activeCallback = callback;
    this.currentMode = mode;
    await this.refreshTopScores(mode);
  }

  async refreshTopScores(mode = this.currentMode) {
    if (!this.activeCallback) return;
    this.currentMode = mode;

    const blockedNames = ['sreedev', 'zhinsu', 'rigved'];

    try {
      const response = await fetch(`/api/leaderboard?mode=${mode}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const cleanData = data.filter(item => item && item.name && !blockedNames.includes(item.name.toLowerCase()));
          // Sync with local cache per mode
          localStorage.setItem(`${this.localLeaderboardKey}_${mode}`, JSON.stringify(cleanData));
          this.activeCallback(cleanData);
          return;
        }
      }
    } catch (err) {
      console.warn('Vercel KV leaderboard fetch unavailable, using local storage fallback.');
    }

    // Fallback: local storage top 10
    this.activeCallback(this.getLocalLeaderboard(mode));
  }

  /**
   * Save or update score for player via POST /api/submit-score.
   */
  async submitScore(name, score, mode = 'fruit-slice') {
    const cleanName = (name || 'Anonymous').trim().substring(0, 20);
    const blockedNames = ['sreedev', 'zhinsu', 'rigved'];
    if (blockedNames.includes(cleanName.toLowerCase())) return 0;

    const pbKey = `${this.personalBestKey}_${mode}`;
    const pb = this.getPersonalBest(mode);

    if (score > pb) {
      localStorage.setItem(pbKey, score.toString());
    }

    // 1. Update local storage leaderboard cache immediately
    this.updateLocalLeaderboard(cleanName, score, mode);

    // 2. Submit score to Vercel KV Serverless Function
    try {
      const response = await fetch('/api/submit-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: cleanName, score: score, mode: mode })
      });

      if (response.ok) {
        console.log(`🏆 Score successfully recorded to Vercel KV (${mode})!`);
        // Refresh leaderboard after successful write
        await this.refreshTopScores(mode);
      }
    } catch (err) {
      console.warn('Failed to post score to /api/submit-score, cached locally:', err);
    }

    return Math.max(score, pb);
  }

  getPersonalBest(mode = 'fruit-slice') {
    const val = localStorage.getItem(`${this.personalBestKey}_${mode}`) || localStorage.getItem(this.personalBestKey);
    return val ? parseInt(val, 10) : 0;
  }

  getLocalLeaderboard(mode = 'fruit-slice') {
    const key = `${this.localLeaderboardKey}_${mode}`;
    const stored = localStorage.getItem(key) || localStorage.getItem(this.localLeaderboardKey);
    let list = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const demoNames = ['MasterNinja', 'BladeRunner', 'FruitSlayer', 'ZenSlicer', 'SamuraiJack', 'ShadowHand', 'SpeedDemon', 'SlashKing', 'ChopChop', 'RookieBlade'];
          const blockedNames = ['sreedev', 'zhinsu', 'rigved'];
          list = parsed.filter(item => {
            if (!item || !item.name) return false;
            const lower = item.name.toLowerCase();
            return !demoNames.includes(item.name) && !blockedNames.includes(lower);
          });
        }
      } catch (e) {
        list = [];
      }
    }

    // Ensure lowercase xhinzu score 88
    const xIdx = list.findIndex(item => item.name.toLowerCase() === 'xhinzu');
    if (xIdx < 0) {
      list.push({ name: 'xhinzu', score: 88 });
    } else {
      list[xIdx].name = 'xhinzu';
      if (list[xIdx].score < 88) list[xIdx].score = 88;
    }

    // Ensure Dingan score 45
    const dIdx = list.findIndex(item => item.name.toLowerCase() === 'dingan');
    if (dIdx < 0) {
      list.push({ name: 'Dingan', score: 45 });
    } else if (list[dIdx].score < 45) {
      list[dIdx].score = 45;
    }

    // Deduplicate case-insensitively
    const dedupedMap = new Map();
    list.forEach(item => {
      const lower = item.name.toLowerCase();
      if (!dedupedMap.has(lower) || item.score > dedupedMap.get(lower).score) {
        dedupedMap.set(lower, item);
      }
    });

    const finalList = Array.from(dedupedMap.values());
    finalList.sort((a, b) => b.score - a.score);
    return finalList;
  }

  updateLocalLeaderboard(name, score, mode = 'fruit-slice') {
    const blockedNames = ['sreedev', 'zhinsu', 'rigved'];
    if (blockedNames.includes(name.toLowerCase())) return;

    const lb = this.getLocalLeaderboard(mode);
    const existingIdx = lb.findIndex(item => item.name.toLowerCase() === name.toLowerCase());

    if (existingIdx >= 0) {
      if (score > lb[existingIdx].score) {
        lb[existingIdx].score = score;
      }
    } else {
      lb.push({ name, score });
    }

    lb.sort((a, b) => b.score - a.score);
    const top10 = lb.slice(0, 10);
    localStorage.setItem(`${this.localLeaderboardKey}_${mode}`, JSON.stringify(top10));
  }
}

export const leaderboard = new LeaderboardManager();
