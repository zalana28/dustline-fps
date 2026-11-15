// DUSTLINE — a tactical three.js FPS. One file wires the modules together:
// the fixed-step simulation (60 Hz, decoupled from rendering), the buy menu,
// firing, planting, round flow, the deterministic screenshot poses, and the
// pause that engages when pointer lock is lost. Nothing here allocates in
// the hot loop beyond the small vectors it reuses.
import * as THREE from 'three';
import { createState, addFeed, award, PHASE } from './state.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createObjective } from './objective.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createWeaponRig, WEAPONS, GRENADE, ARMOR, BUY_ORDER } from './weapons.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const shotSeed = Number.parseInt(params.get('seed') ?? '1337', 10) || 1337;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#241a12');
scene.fog = new THREE.Fog(new THREE.Color('#241a12'), 30, 75);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const state = createState();
const audio = createAudio();
const map = createMap(scene);
const player = createPlayer(map.colliders, map.spawns.vanguard[0]);
const bots = createBots(scene, map, shotSeed);
const objective = createObjective(scene, map);
const hud = createHud(document);
const weaponRig = createWeaponRig(camera);
const combat = createCombat(scene, map, bots, audio);

// The player's hit meshes: invisible boxes the bots raycast against. They
// follow the camera and are never rendered (opacity 0, no depth write).
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.3), hitMat);
playerTorso.userData.part = 'torso';
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hitMat);
playerHead.userData.part = 'head';
scene.add(playerTorso, playerHead);
const playerHitMeshes = [playerTorso, playerHead];

const owned = new Set(['pistol']);
let buyMenuOpen = true;
let lastBuyKey = '';
let prevFiring = false;
let dryTimer = 0;
let frozen = Boolean(shotMode);
let paused = !shotMode; // The game waits behind the start overlay until the player locks the pointer.

const botCtx = {
  playerPos: player.state.position,
  playerAlive: true,
  playerHitMeshes,
  playerSpeed: 0,
  spikePlanted: false,
  spikeSite: null,
  spikePos: null,
  shots: [],
  fireBotShot(bot, targetPos, target) {
    combat.botShoot(bot, targetPos, target, combatCtx);
    botCtx.shots.push({ x: bot.group.position.x, z: bot.group.position.z });
  },
  defuseProgress(frac) {
    objective.state.defuseProgress = frac;
  },
  spikeDefused(bot) {
    addFeed(state, `${bot.name} defused the spike`);
    rounds.endRound('jackal', 'Spike defused');
  },
  plantProgress(frac, site) {},
  spikePlantedBy(bot, site) {
    objective.plantAt(site, bot.group.position);
    botCtx.spikePlanted = true;
    botCtx.spikeSite = site;
    botCtx.spikePos = bot.group.position;
    addFeed(state, `${bot.name} planted the spike at ${site}`);
    hud.showBanner('SPIKE PLANTED', `Site ${site} — defend it or lose the round`, 3);
  },
  spikePickedUp(bot) {
    objective.pickUpByBot(bot);
    addFeed(state, `${bot.name} picked up the spike`);
  },
  damagePlayer(amount, part, fromBot) {
    damagePlayer(amount, part, fromBot);
  },
  botKill(shooter, victim, part, killed) {
    if (!killed) return;
    addFeed(state, `${shooter.name} ▸ ${victim.name}${part === 'head' ? ' (headshot)' : ''}`);
  },
};

const combatCtx = {
  playerHitMeshes,
  playerPos: player.state.position,
  playerSpeed: 0,
  damagePlayer(amount, part, fromBot) {
    damagePlayer(amount, part, fromBot);
  },
  botKill(shooter, victim, part, killed) {
    botCtx.botKill(shooter, victim, part, killed);
  },
  grenadeKill(bot, damage, killed) {
    if (!killed) return;
    addFeed(state, `You ▸ ${bot.name} (frag)`);
    award(state, 300);
  },
};

function damagePlayer(amount, part, fromBot) {
  if (!state.player.alive) return;
  const absorbed = Math.min(state.player.armor, amount * 0.5);
  state.player.armor -= absorbed;
  state.player.health -= amount - absorbed;
  hud.damageFlash();
  if (state.player.health > 0) return;
  state.player.health = 0;
  state.player.alive = false;
  botCtx.playerAlive = false;
  addFeed(state, `${fromBot ? `${fromBot.name} ▸ You` : 'You were caught in the blast'}`);
  hud.showBanner('YOU WERE ELIMINATED', 'Your team fights on — watch and wait for the next round', 4);
  if (objective.state.holder === 'player') {
    objective.dropAt(player.state.position);
    bots.spikeDropAt(player.state.position);
  }
  owned.clear();
  owned.add('pistol');
  weaponRig.resetToPistol();
  camera.children.forEach((child) => { child.visible = false; });
  if (bots.aliveCount('vanguard') === 0) {
    rounds.endRound('jackal', 'All Vanguard eliminated');
  }
}

function respawnPlayer() {
  const spawn = map.spawns.vanguard[0];
  player.respawn(spawn, 0);
  state.player.health = 100;
  state.player.alive = true;
  botCtx.playerAlive = true;
  weaponRig.refill();
  camera.children.forEach((child) => { child.visible = true; });
  weaponRig.equip(weaponRig.state.current);
}

function resetMatch() {
  state.wins.vanguard = 0;
  state.wins.jackal = 0;
  state.round = 1;
  state.money = 800;
  state.matchOver = false;
  state.winner = null;
  state.feed.length = 0;
  owned.clear();
  owned.add('pistol');
  weaponRig.resetToPistol();
  state.player.armor = 0;
  state.player.kills = 0;
  state.player.deaths = 0;
  objective.reset();
  bots.reset(1);
  botCtx.spikePlanted = false;
  botCtx.spikeSite = null;
  botCtx.spikePos = null;
  respawnPlayer();
  rounds.startRound();
}

const rounds = createRounds(state, {
  onRoundStart(round) {
    bots.reset(round);
    objective.reset();
    botCtx.spikePlanted = false;
    botCtx.spikeSite = null;
    botCtx.spikePos = null;
    respawnPlayer();
    buyMenuOpen = true;
    hud.showBanner(`ROUND ${round}`, round === 1 ? 'Plant the spike at A or B — first to 5 rounds wins' : 'Buy up, then plant the spike', 3);
    addFeed(state, `— Round ${round} —`);
  },
  onLiveStart() {
    hud.showBanner('GO GO GO', 'Plant the spike at A or B', 1.5);
  },
  onRoundEnd(vanguardWon, reason, vanguardWins, jackalWins) {
    audio[vanguardWon ? 'roundWin' : 'roundLose']();
    hud.showBanner(
      vanguardWon ? 'ROUND WON' : 'ROUND LOST',
      `${reason} · ${vanguardWins} — ${jackalWins}`,
      4,
    );
    addFeed(state, vanguardWon ? `Round won — ${reason}` : `Round lost — ${reason}`);
  },
  onMatchEnd(vanguardWon) {
    document.exitPointerLock();
    hud.showOverlay(
      vanguardWon ? 'VICTORY' : 'DEFEAT',
      vanguardWon
        ? `Vanguard takes the match ${state.wins.vanguard} — ${state.wins.jackal}. DUSTLINE is yours.`
        : `Jackal takes the match ${state.wins.jackal} — ${state.wins.vanguard}. Run it back.`,
      'PLAY AGAIN',
      () => {
        hud.hideOverlay();
        resetMatch();
        input.requestLock();
      },
    );
  },
});

const input = createInput(canvas, (locked) => {
  paused = !locked && !shotMode;
  if (locked) {
    hud.hideOverlay();
    hud.clearHint();
    audio.unlock();
  } else if (!shotMode) {
    hud.showOverlay(
      'DUSTLINE',
      'Tactical FPS — plant the spike at A or B, first to 5 rounds. WASD move · mouse aim · click shoot · R reload · G grenade · E plant · B buy menu · M mute.',
      'CLICK TO PLAY',
      () => input.requestLock(),
    );
  }
});

canvas.addEventListener('click', () => {
  if (!input.state.locked && !shotMode) input.requestLock();
});

function tryBuy(index) {
  if (state.phase !== PHASE.BUY) return;
  const id = BUY_ORDER[index];
  if (!id) return;
  if (id === 'grenade') {
    if (weaponRig.state.grenades >= GRENADE.max) return;
    if (state.money < GRENADE.price) return;
    state.money -= GRENADE.price;
    weaponRig.state.grenades += 1;
    audio.buy();
    return;
  }
  if (id === 'armor') {
    if (state.player.armor >= 100) return;
    if (state.money < ARMOR.price) return;
    state.money -= ARMOR.price;
    state.player.armor = 100;
    audio.buy();
    return;
  }
  const def = WEAPONS[id];
  if (owned.has(id)) {
    weaponRig.equip(id);
    return;
  }
  if (state.money < def.price) return;
  state.money -= def.price;
  owned.add(id);
  weaponRig.equip(id);
  audio.buy();
}

function fireWeapon() {
  const def = weaponRig.def();
  if (!weaponRig.ready()) {
    if (weaponRig.state.mag === 0 && weaponRig.state.reloadLeft === 0) {
      if (weaponRig.reload()) audio.reload();
    } else if (weaponRig.state.mag === 0) {
      dryTimer -= STEP;
      if (dryTimer <= 0) {
        audio.dryFire();
        dryTimer = 0.25;
      }
    }
    return;
  }
  if (!weaponRig.takeRound()) return;
  weaponRig.pullTrigger();
  audio.shot(def.kind);
  player.recoil(def.recoil * (input.state.aiming ? 0.6 : 1), (Math.random() - 0.5) * def.recoil * 0.4);
  const speed = player.groundSpeed();
  const spread = weaponRig.spread(speed);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    combat.shoot(camera, def, spread, (hit) => {
      if (hit.kind === 'bot') {
        audio.hit(hit.killed);
        hud.hitmarker(hit.killed);
        if (hit.killed) {
          state.player.kills += 1;
          award(state, 300);
          addFeed(state, `You ▸ ${hit.bot.name}${hit.part === 'head' ? ' (headshot)' : ''}`);
        }
      }
    });
  }
  botCtx.shots.push({ x: player.state.position.x, z: player.state.position.z });
}

function stepSim(dt) {
  rounds.step(dt);

  // Look applies every frame; movement and actions run on the fixed step.
  const look = input.takeLook();
  if (input.state.locked) player.look(look.x, look.y);

  if (state.player.alive && input.state.locked) {
    player.step(dt, input.state.keys);
  }
  combatCtx.playerSpeed = player.groundSpeed();
  botCtx.playerSpeed = combatCtx.playerSpeed;

  // Firing: automatic weapons hold, semi-automatic fire on the press edge.
  const firing = input.state.firing && input.state.locked;
  const def = weaponRig.def();
  if (firing && state.player.alive && state.phase === PHASE.LIVE) {
    if (def.auto) fireWeapon();
    else if (!prevFiring) fireWeapon();
  }
  prevFiring = firing;

  if (input.takePressed('KeyR') && state.player.alive) {
    if (weaponRig.reload()) audio.reload();
  }
  if (input.takePressed('KeyG') && state.player.alive && state.phase === PHASE.LIVE) {
    if (weaponRig.state.grenades > 0) {
      weaponRig.state.grenades -= 1;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const from = camera.position.clone().addScaledVector(direction, 0.4);
      combat.throwGrenade(from, direction, combatCtx);
    }
  }
  if (input.takePressed('KeyM')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }
  if (input.takePressed('KeyB')) buyMenuOpen = !buyMenuOpen;

  // Buy keys 1-7.
  for (let i = 0; i < BUY_ORDER.length; i += 1) {
    if (input.takePressed(`Digit${i + 1}`)) tryBuy(i);
  }

  // Plant: hold E inside a site while carrying the spike.
  if (state.phase === PHASE.LIVE && state.player.alive && objective.state.holder === 'player') {
    const holding = input.state.keys.has('KeyE');
    const site = objective.plantStep(dt, player.state.position, holding);
    if (holding && site && objective.plantDone()) {
      objective.plantAt(site, player.state.position);
      botCtx.spikePlanted = true;
      botCtx.spikeSite = site;
      botCtx.spikePos = player.state.position.clone();
      award(state, 300);
      addFeed(state, `You planted the spike at ${site}`);
      hud.showBanner('SPIKE PLANTED', `Site ${site} — hold it for 35 seconds`, 3);
    }
  }

  if (state.phase === PHASE.LIVE) {
    objective.state.defuseProgress = 0;
    bots.step(dt, botCtx, state.elapsed);
    bots.fetchStep(dt, botCtx);
  }

  objective.step(dt, audio, () => {
    rounds.endRound('vanguard', 'Spike detonated');
  });

  combat.step(dt);
  weaponRig.step(dt);

  // Round end by elimination.
  if (state.phase === PHASE.LIVE) {
    if (bots.aliveCount('jackal') === 0) {
      rounds.endRound('vanguard', 'All Jackals eliminated');
    } else if (bots.aliveCount('vanguard') === 0 && !state.player.alive) {
      rounds.endRound('jackal', 'All Vanguard eliminated');
    }
  }

  // Scope: the marksman zooms on right mouse.
  const targetFov = input.state.aiming && weaponRig.def().kind === 'marksman' ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  botCtx.shots.length = 0;
  state.elapsed += dt;
}

// Deterministic screenshot poses: the same URL always shows the same frame.
// The simulation is frozen after setup, so the bots stay where they are put.
function applyShotMode() {
  if (!shotMode) return;
  bots.reset(1);
  if (shotMode === 'start') {
    state.phase = PHASE.BUY;
    state.phaseLeft = 12;
    state.round = 1;
    respawnPlayer();
    hud.showBanner('ROUND 1', 'Plant the spike at A or B — first to 5 rounds wins', 3600);
  } else if (shotMode === 'play') {
    state.phase = PHASE.LIVE;
    state.timer = 78;
    state.round = 3;
    state.wins.vanguard = 2;
    state.wins.jackal = 1;
    state.money = 2400;
    weaponRig.equip('rifle');
    weaponRig.state.mag = 18;
    weaponRig.state.reserve = 50;
    player.respawn(new THREE.Vector3(-6, 0, 6), 0.245);
    player.state.pitch = 0.02;
    const jackalA = bots.bots.find((b) => b.id === 'jackal-0');
    const jackalB = bots.bots.find((b) => b.id === 'jackal-1');
    const ally = bots.bots.find((b) => b.id === 'vanguard-0');
    if (jackalA) {
      jackalA.group.position.set(-8, 0, -2);
      jackalA.group.rotation.y = 0.245;
    }
    if (jackalB) {
      jackalB.group.position.set(-2, 0, -6);
      jackalB.group.rotation.y = -0.322;
    }
    if (ally) {
      ally.group.position.set(-3, 0, 2);
      ally.group.rotation.y = 0;
    }
    combat.spawnTracer(new THREE.Vector3(-6, 1.55, 6), new THREE.Vector3(-8, 1.3, -2));
    hud.hideBanner();
    state.feed.length = 0;
    addFeed(state, '— Round 3 —');
    addFeed(state, 'Havoc ▸ Dingo');
  } else if (shotMode === 'end') {
    state.phase = PHASE.END;
    state.phaseLeft = 5;
    state.round = 6;
    state.wins.vanguard = 3;
    state.wins.jackal = 2;
    state.money = 3150;
    weaponRig.equip('rifle');
    weaponRig.state.mag = 12;
    weaponRig.state.reserve = 50;
    player.respawn(new THREE.Vector3(-10, 0, -4), Math.PI / 4);
    player.state.pitch = -0.05;
    const fallen = bots.bots.find((b) => b.id === 'jackal-0');
    if (fallen) {
      fallen.alive = false;
      fallen.fall = 1;
      fallen.group.position.set(-13.5, 0, -6);
      fallen.group.rotation.set(-1.45, 0.9, 0);
    }
    const ally = bots.bots.find((b) => b.id === 'vanguard-1');
    if (ally) {
      ally.group.position.set(-12, 0, -6);
      ally.group.rotation.y = 0.8;
    }
    objective.state.holder = 'detonated';
    objective.state.site = 'A';
    state.feed.length = 0;
    addFeed(state, '— Round 6 —');
    addFeed(state, 'Round won — Spike detonated');
    hud.showBanner('ROUND WON', 'Spike detonated — Site A · 3 — 2', 3600);
  }
  hud.hideOverlay();
}

function frame() {
  requestAnimationFrame(frame);
  const dt = frameDelta();

  if (!frozen && !paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      stepSim(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  }

  // Camera follows the player's eyes.
  camera.position.set(
    player.state.position.x,
    player.state.position.y + player.state.eye,
    player.state.position.z,
  );
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;

  // The player's hit meshes follow the body.
  playerTorso.position.set(player.state.position.x, player.state.position.y + 1.0, player.state.position.z);
  playerHead.position.set(player.state.position.x, player.state.position.y + 1.56, player.state.position.z);
  if (!state.player.alive) {
    playerTorso.position.y = -10;
    playerHead.position.y = -10;
  }

  // HUD: buy menu only during the buy phase; hints by context.
  const inSite = objective.inSite(player.state.position);
  if (state.phase === PHASE.BUY && buyMenuOpen) {
    hud.el.buyMenu.classList.add('show');
    const buyKey = `${state.money}|${[...owned].join(',')}|${weaponRig.state.grenades}|${state.player.armor}`;
    if (buyKey !== lastBuyKey) {
      lastBuyKey = buyKey;
      hud.renderBuyMenu(state.money, owned, weaponRig.state.grenades);
    }
  } else {
    hud.el.buyMenu.classList.remove('show');
  }
  if (!shotMode && !input.state.locked && state.phase !== PHASE.MATCH) {
    hud.setHint('Click the game to play — pointer lock captures your mouse');
  } else if (state.phase === PHASE.LIVE && state.player.alive && objective.state.holder === 'player' && inSite) {
    hud.setHint('HOLD E TO PLANT THE SPIKE');
  } else if (state.phase === PHASE.LIVE && state.player.alive && objective.state.holder === 'player') {
    hud.setHint('Carry the spike to Site A or Site B');
  } else if (!state.player.alive) {
    hud.setHint('You are down — your team fights on');
  } else {
    hud.clearHint();
  }

  hud.step(state, weaponRig, state.player, bots, objective, weaponRig.spread(player.groundSpeed()), frozen ? 0 : dt);
  renderer.render(scene, camera);

  if (!window.__ready) {
    window.__ready = true;
    document.title = 'DUSTLINE ready';
  }
}

const clock = { last: performance.now() };
let accumulator = 0;

function frameDelta() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - clock.last) / 1000);
  clock.last = now;
  return dt;
}

rounds.startRound();
applyShotMode();
if (!shotMode) {
  hud.showOverlay(
    'DUSTLINE',
    'Tactical FPS — plant the spike at A or B, first to 5 rounds. WASD move · mouse aim · click shoot · R reload · G grenade · E plant · B buy menu · M mute.',
    'CLICK TO PLAY',
    () => input.requestLock(),
  );
}
frame();
