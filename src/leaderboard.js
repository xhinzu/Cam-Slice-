/**
 * Leaderboard Module - Vercel KV Serverless API Integration & Local Storage Fallback.
 * Calls /api/leaderboard (GET) and /api/submit-score (POST).
 */

class LeaderboardManager {
  constructor() {
    this.localLeaderboardKey = 'fruit_slice_local_lb';
    this.personalBestKey = 'fruit_slice_pb';
    this.activeCallback = null;
  }

  /**
   * Subscribe / query top-10 leaderboard scores from /api/leaderboard or local storage.
   */
  async subscribeTopScores(callback, currentPlayerName = '') {
    this.activeCallback = callback;
    await this.refreshTopScores();
  }

  async refreshTopScores() {
    if (!this.activeCallback) return;

    try {
      const response = await fetch('/api/leaderboard');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          // Sync with local cache
          localStorage.setItem(this.localLeaderboardKey, JSON.stringify(data));
          this.activeCallback(data);
          return;
        }
      }
    } catch (err) {
      console.warn('Vercel KV leaderboard fetch unavailable, using local storage fallback.');
    }

    // Fallback: local storage top 10
    this.activeCallback(this.getLocalLeaderboard());
  }

  /**
   * Save or update score for player via POST /api/submit-score.
   */
  async submitScore(name, score) {
    const cleanName = (name || 'Anonymous').trim().substring(0, 20);
    const pb = this.getPersonalBest();

    if (score > pb) {
      localStorage.setItem(this.personalBestKey, score.toString());
    }

    // 1. Update local storage leaderboard cache immediately
    this.updateLocalLeaderboard(cleanName, score);

    // 2. Submit score to Vercel KV Serverless Function
    try {
      const response = await fetch('/api/submit-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: cleanName, score: score })
      });

      if (response.ok) {
        console.log('🏆 Score successfully recorded to Vercel KV!');
        // Refresh leaderboard after successful write
        await this.refreshTopScores();
      }
    } catch (err) {
      console.warn('Failed to post score to /api/submit-score, cached locally:', err);
    }

    return Math.max(score, pb);
  }

  getPersonalBest() {
    const val = localStorage.getItem(this.personalBestKey);
    return val ? parseInt(val, 10) : 0;
  }

  getLocalLeaderboard() {
    const stored = localStorage.getItem(this.localLeaderboardKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // Fallback default mock data
      }
    }

    // Default mock slicer leaderboard for instant UI preview
    const defaultLB = [
      { name: 'MasterNinja', score: 84 },
      { name: 'BladeRunner', score: 65 },
      { name: 'FruitSlayer', score: 52 },
      { name: 'ZenSlicer', score: 41 },
      { name: 'SamuraiJack', score: 33 },
      { name: 'ShadowHand', score: 28 },
      { name: 'SpeedDemon', score: 22 },
      { name: 'SlashKing', score: 18 },
      { name: 'ChopChop', score: 12 },
      { name: 'RookieBlade', score: 5 }
    ];

    localStorage.setItem(this.localLeaderboardKey, JSON.stringify(defaultLB));
    return defaultLB;
  }

  updateLocalLeaderboard(name, score) {
    const lb = this.getLocalLeaderboard();
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
    localStorage.setItem(this.localLeaderboardKey, JSON.stringify(top10));
  }
}

export const leaderboard = new LeaderboardManager();
