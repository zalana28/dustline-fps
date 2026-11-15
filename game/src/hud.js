// The HUD: every DOM element the player reads, updated from the state store
// once a frame. Health and armor bars, ammo, money, the round clock, the
// score, alive counts, the kill feed, the spike status, the plant channel,
// the buy menu, the round banner and the match overlay. The crosshair spreads
// with the weapon's current spread, and a red vignette flashes on damage.
import { WEAPONS, BUY_ORDER, GRENADE, ARMOR } from './weapons.js';
import { PHASE } from './state.js';

export function createHud(document) {
  const el = {};
  for (const id of [
    'healthBar', 'healthText', 'armorBar', 'ammoText', 'weaponText', 'moneyText',
    'timerText', 'scoreText', 'aliveText', 'feed', 'spikeText', 'channelWrap',
    'channelFill', 'channelLabel', 'buyMenu', 'buyList', 'banner', 'overlay',
    'overlayTitle', 'overlayText', 'overlayButton', 'crosshair', 'hitmarker',
    'damageFlash', 'hintText', 'grenadeText', 'spikeCarry',
  ]) {
    el[id] = document.getElementById(id);
  }

  let lastFeedLength = 0;
  let bannerTimer = 0;

  function showBanner(text, sub, duration = 3) {
    el.banner.textContent = text;
    el.banner.classList.add('show');
    bannerTimer = duration;
    if (sub) {
      el.hintText.textContent = sub;
      el.hintText.classList.add('show');
    }
  }

  function hideBanner() {
    el.banner.classList.remove('show');
    bannerTimer = 0;
  }

  function showOverlay(title, text, buttonLabel, onButton) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlayButton.textContent = buttonLabel;
    el.overlay.classList.add('show');
    el.overlayButton.onclick = onButton;
  }

  function hideOverlay() {
    el.overlay.classList.remove('show');
  }

  function renderBuyMenu(money, owned, grenades) {
    const rows = BUY_ORDER.map((id, i) => {
      const def = id === 'grenade' ? GRENADE : id === 'armor' ? ARMOR : WEAPONS[id];
      const ownedMark = id !== 'grenade' && id !== 'armor' && owned.has(id) ? 'OWNED' : '';
      const grenadeMark = id === 'grenade' ? `x${grenades}` : '';
      const afford = money >= def.price ? '' : 'cant';
      const key = i + 1;
      return `<div class="buy-row ${afford}"><span class="buy-key">${key}</span><span class="buy-name">${def.name}</span><span class="buy-own">${ownedMark}${grenadeMark}</span><span class="buy-price">$${def.price}</span></div>`;
    }).join('');
    el.buyList.innerHTML = rows;
  }

  function step(state, weapon, player, bots, objective, spread, dt) {
    // Health, armor, ammo, weapon, money.
    el.healthBar.style.width = `${Math.max(0, player.health)}%`;
    el.healthText.textContent = Math.ceil(Math.max(0, player.health));
    el.armorBar.style.width = `${Math.max(0, player.armor)}%`;
    el.ammoText.textContent = `${weapon.state.mag} / ${weapon.state.reserve}`;
    el.weaponText.textContent = weapon.def().name;
    el.moneyText.textContent = `$${state.money}`;
    el.grenadeText.textContent = weapon.state.grenades > 0 ? `GRENADES ${weapon.state.grenades} [G]` : '';

    // Clock: buy countdown, then the round timer, then the end banner timer.
    if (state.phase === PHASE.BUY) el.timerText.textContent = `BUY ${Math.ceil(state.phaseLeft)}`;
    else if (state.phase === PHASE.LIVE) el.timerText.textContent = `${Math.floor(state.timer / 60)}:${String(Math.floor(state.timer % 60)).padStart(2, '0')}`;
    else el.timerText.textContent = '—';
    el.scoreText.textContent = `${state.wins.vanguard} — ${state.wins.jackal}`;
    el.aliveText.textContent = `VANGUARD ${bots.aliveCount('vanguard')} · JACKAL ${bots.aliveCount('jackal')}`;

    // Spike status line.
    const spike = objective.state;
    if (spike.holder === 'planted') {
      el.spikeText.textContent = `SPIKE PLANTED · SITE ${spike.site} · ${Math.ceil(spike.fuseLeft)}s`;
      el.spikeText.className = 'spike planted';
    } else if (spike.holder === 'detonated') {
      el.spikeText.textContent = `SPIKE DETONATED — SITE ${spike.site}`;
      el.spikeText.className = 'spike planted';
    } else if (spike.holder === 'player') {
      el.spikeText.textContent = 'YOU CARRY THE SPIKE — PLANT AT A OR B [HOLD E]';
      el.spikeText.className = 'spike carry';
    } else if (spike.holder === 'bot') {
      el.spikeText.textContent = 'A TEAMMATE CARRIES THE SPIKE';
      el.spikeText.className = 'spike';
    } else {
      el.spikeText.textContent = 'SPIKE DROPPED — A TEAMMATE WILL FETCH IT';
      el.spikeText.className = 'spike dropped';
    }
    el.spikeCarry.textContent = spike.holder === 'player' ? 'SPIKE' : '';

    // Plant / defuse channel.
    const progress = spike.plantProgress > 0 ? spike.plantProgress / objective.plantSeconds : 0;
    if (progress > 0) {
      el.channelWrap.classList.add('show');
      el.channelFill.style.width = `${Math.min(100, progress * 100)}%`;
      el.channelLabel.textContent = 'PLANTING SPIKE…';
    } else {
      el.channelWrap.classList.remove('show');
    }

    // Kill feed: append only new lines.
    if (state.feed.length !== lastFeedLength) {
      el.feed.innerHTML = state.feed.map((line) => `<div>${line}</div>`).join('');
      lastFeedLength = state.feed.length;
    }

    // Crosshair spread.
    const gap = 6 + spread * 260;
    el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) hideBanner();
    }
  }

  function damageFlash() {
    el.damageFlash.classList.remove('flash');
    void el.damageFlash.offsetWidth;
    el.damageFlash.classList.add('flash');
  }

  function hitmarker(kill) {
    el.hitmarker.classList.remove('kill');
    void el.hitmarker.offsetWidth;
    if (kill) el.hitmarker.classList.add('kill');
    el.hitmarker.classList.add('show');
    setTimeout(() => el.hitmarker.classList.remove('show'), 120);
  }

  return {
    el,
    step,
    showBanner,
    hideBanner,
    showOverlay,
    hideOverlay,
    renderBuyMenu,
    damageFlash,
    hitmarker,
    setHint(text) {
      el.hintText.textContent = text;
      el.hintText.classList.add('show');
    },
    clearHint() {
      el.hintText.classList.remove('show');
    },
  };
}
