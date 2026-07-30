/**
 * User & Store Manager Module
 * Manages player coins, cursor purchases, equipped cursor, avatar uploads/emojis,
 * and lifetime slice/punch stats.
 */

export class UserStoreManager {
  constructor() {
    this.coinsKey = 'fruit_slice_coins';
    this.ownedCursorsKey = 'fruit_slice_owned_cursors';
    this.equippedCursorKey = 'fruit_slice_equipped_cursor';
    this.ownedExoskeletonsKey = 'fruit_slice_owned_exoskeletons';
    this.equippedExoskeletonKey = 'fruit_slice_equipped_exoskeleton';
    this.avatarKey = 'fruit_slice_avatar';
    this.totalFruitsKey = 'fruit_slice_total_fruits';
    this.totalGlassKey = 'fruit_slice_total_glass';

    // Hit counters for coin rewards (5 hits = +10 coins)
    this.sessionFruitHits = 0;
    this.sessionGlassHits = 0;

    this.initDefaults();
  }

  initDefaults() {
    if (localStorage.getItem(this.coinsKey) === null) {
      localStorage.setItem(this.coinsKey, '100'); // Starting 100 coin bonus
    }
    this.checkSpecialBonus();
    if (!localStorage.getItem(this.ownedCursorsKey)) {
      localStorage.setItem(this.ownedCursorsKey, JSON.stringify(['cyan']));
    }
    if (!localStorage.getItem(this.equippedCursorKey)) {
      localStorage.setItem(this.equippedCursorKey, 'cyan');
    }
    if (!localStorage.getItem(this.ownedExoskeletonsKey)) {
      localStorage.setItem(this.ownedExoskeletonsKey, JSON.stringify(['green', 'goth']));
    }
    if (!localStorage.getItem(this.equippedExoskeletonKey)) {
      localStorage.setItem(this.equippedExoskeletonKey, 'green');
    }
    if (!localStorage.getItem(this.avatarKey)) {
      localStorage.setItem(this.avatarKey, JSON.stringify({ type: 'emoji', value: '🥷' }));
    }
  }

  checkSpecialBonus() {
    const savedName = (localStorage.getItem('fruit_slice_player_name') || '').trim().toLowerCase();
    if (savedName === 'xhinzu') {
      const current = parseInt(localStorage.getItem(this.coinsKey) || '0', 10);
      if (current < 9000) {
        localStorage.setItem(this.coinsKey, '9000');
      }
    } else {
      // If a non-xhinzu player received 9000 coins previously due to empty name bug, reset to 100
      const current = parseInt(localStorage.getItem(this.coinsKey) || '0', 10);
      if (current === 9000) {
        localStorage.setItem(this.coinsKey, '100');
      }
    }
  }

  getCoins() {
    this.checkSpecialBonus();
    return parseInt(localStorage.getItem(this.coinsKey) || '0', 10);
  }

  addCoins(amount) {
    const current = this.getCoins();
    const updated = Math.max(0, current + amount);
    localStorage.setItem(this.coinsKey, updated.toString());
    return updated;
  }

  getOwnedCursors() {
    try {
      return JSON.parse(localStorage.getItem(this.ownedCursorsKey)) || ['cyan'];
    } catch (e) {
      return ['cyan'];
    }
  }

  getEquippedCursor() {
    return localStorage.getItem(this.equippedCursorKey) || 'cyan';
  }

  equipCursor(cursorId) {
    localStorage.setItem(this.equippedCursorKey, cursorId);
  }

  buyCursor(cursorId, price) {
    const coins = this.getCoins();
    if (coins < price) return false;

    const owned = this.getOwnedCursors();
    if (!owned.includes(cursorId)) {
      owned.push(cursorId);
      localStorage.setItem(this.ownedCursorsKey, JSON.stringify(owned));
    }
    this.addCoins(-price);
    this.equipCursor(cursorId);
    return true;
  }

  getOwnedExoskeletons() {
    try {
      return JSON.parse(localStorage.getItem(this.ownedExoskeletonsKey)) || ['green', 'goth'];
    } catch (e) {
      return ['green', 'goth'];
    }
  }

  getEquippedExoskeleton() {
    return localStorage.getItem(this.equippedExoskeletonKey) || 'green';
  }

  equipExoskeleton(exoId) {
    localStorage.setItem(this.equippedExoskeletonKey, exoId);
  }

  buyExoskeleton(exoId, price = 400) {
    const coins = this.getCoins();
    if (coins < price) return false;

    const owned = this.getOwnedExoskeletons();
    if (!owned.includes(exoId)) {
      owned.push(exoId);
      localStorage.setItem(this.ownedExoskeletonsKey, JSON.stringify(owned));
    }
    this.addCoins(-price);
    this.equipExoskeleton(exoId);
    return true;
  }

  /**
   * Record fruit slice -> Increment total & add 10 coins on every 5th fruit
   */
  recordFruitSlice() {
    const total = parseInt(localStorage.getItem(this.totalFruitsKey) || '0', 10) + 1;
    localStorage.setItem(this.totalFruitsKey, total.toString());

    this.sessionFruitHits++;
    if (this.sessionFruitHits % 5 === 0) {
      this.addCoins(10);
      return 10; // Earned 10 coins
    }
    return 0;
  }

  /**
   * Record glass punch -> Increment total & add 10 coins on every 5th glass pane
   */
  recordGlassPunch() {
    const total = parseInt(localStorage.getItem(this.totalGlassKey) || '0', 10) + 1;
    localStorage.setItem(this.totalGlassKey, total.toString());

    this.sessionGlassHits++;
    if (this.sessionGlassHits % 5 === 0) {
      this.addCoins(10);
      return 10; // Earned 10 coins
    }
    return 0;
  }

  getTotalFruits() {
    return parseInt(localStorage.getItem(this.totalFruitsKey) || '0', 10);
  }

  getTotalGlass() {
    return parseInt(localStorage.getItem(this.totalGlassKey) || '0', 10);
  }

  getAvatar() {
    try {
      return JSON.parse(localStorage.getItem(this.avatarKey)) || { type: 'emoji', value: '🥷' };
    } catch (e) {
      return { type: 'emoji', value: '🥷' };
    }
  }

  setAvatar(type, value) {
    localStorage.setItem(this.avatarKey, JSON.stringify({ type, value }));
  }
}

export const userStore = new UserStoreManager();
