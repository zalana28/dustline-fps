// Bots: four Vanguard teammates and five Jackal defenders. Each bot is a
// small state machine — route, hold, engage, plant, defuse, fetch, investigate
// — walking a waypoint graph, seeing through a vision cone with a line-of-
// sight ray, hearing gunfire, and firing hitscan bursts with a reaction delay
// and aim error that shrinks while it holds a target. Vanguard attacks and
// carries the spike when the player falls; Jackals hold the sites and converge
// to defuse a planted spike. All shooting resolves through the same raycast
// the player's shots use, so a bot's bullet is a real bullet.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, findRoute } from './map.js';

const BOT_SPEED = 3.8;
const HOLD_SPEED = 2.2;
const VISION_RANGE = 38;
const VISION_COS = 0.2;
const HEAR_RADIUS = 26;
const HEALTH = 100;
const BOT_DAMAGE = 12;
const DEFUSE_SECONDS = 5;
const PLANT_SECONDS = 3;

const VANGUARD_NAMES = ['Rook', 'Havoc', 'Sable', 'Wren'];
const JACKAL_NAMES = ['Dingo', 'Viper', 'Mako', 'Rex', 'Fang'];

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBots(scene, map, seed) {
  const random = mulberry32(seed);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const probe = new THREE.Box3();
  const eyePos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const forwardVec = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const plateGeo = new THREE.BoxGeometry(0.54, 0.4, 0.06);
  const visorGeo = new THREE.BoxGeometry(0.22, 0.06, 0.05);

  const bots = [];
  const hitMeshes = [];

  function makeBot(name, team, index, spawn) {
    const isJackal = team === 'jackal';
    const cloth = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isJackal ? '#3a2a24' : '#24343a'),
      roughness: 0.85, metalness: 0.05,
    });
    const plate = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isJackal ? PALETTE.foe : PALETTE.ally),
      roughness: 0.6, metalness: 0.2,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isJackal ? PALETTE.foe : PALETTE.ally),
      roughness: 0.3, metalness: 0.4,
      emissive: new THREE.Color(isJackal ? PALETTE.foe : PALETTE.ally),
      emissiveIntensity: 0.7,
    });

    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, cloth);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const chest = new THREE.Mesh(plateGeo, plate);
    chest.position.set(0, 1.05, 0.17);
    const head = new THREE.Mesh(headGeo, cloth);
    head.position.y = 1.56;
    head.castShadow = true;
    const visorMesh = new THREE.Mesh(visorGeo, visor);
    visorMesh.position.set(0, 1.58, 0.14);
    const gun = new THREE.Mesh(gunGeo, cloth);
    gun.position.set(0.28, 1.15, -0.2);
    const legL = new THREE.Mesh(legGeo, cloth);
    legL.position.set(-0.14, 0.3, 0);
    const legR = new THREE.Mesh(legGeo, cloth);
    legR.position.set(0.14, 0.3, 0);
    group.add(torso, chest, head, visorMesh, gun, legL, legR);
    group.position.copy(spawn);
    scene.add(group);

    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      index,
      group,
      torso,
      head,
      health: HEALTH,
      alive: true,
      yaw: 0,
      speed: BOT_SPEED,
      state: 'hold',
      route: [],
      routeIndex: 0,
      holdNode: null,
      holdTimer: 0,
      target: null, // { kind: 'player' | 'bot', ref, pos }
      aimTime: 0,
      reactAt: 0,
      burstLeft: 0,
      burstGap: 0,
      firePause: 0,
      investigate: null,
      investigateTimer: 0,
      carryingSpike: false,
      channel: 0, // plant/defuse progress seconds
      channelKind: null,
      strafeDir: 1,
      strafeTimer: 0,
      bobPhase: random() * Math.PI * 2,
      fall: 0,
      assignment: null,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) {
    makeBot(VANGUARD_NAMES[i], 'vanguard', i, map.spawns.vanguard[i + 1]);
  }
  for (let i = 0; i < 5; i += 1) {
    makeBot(JACKAL_NAMES[i], 'jackal', i, map.spawns.jackal[i]);
  }

  function nearestNode(pos) {
    let best = null;
    let bestDist = Infinity;
    for (const [name, node] of Object.entries(WAYPOINTS)) {
      const d = (node.x - pos.x) ** 2 + (node.z - pos.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = name;
      }
    }
    return best;
  }

  function overlaps(x, z) {
    probe.min.set(x - 0.35, 0.05, z - 0.35);
    probe.max.set(x + 0.35, 1.7, z + 0.35);
    for (const collider of map.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.group.position.x;
    const dz = tz - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, speed * dt);
    moveDir.set(dx / dist, 0, dz / dist);
    const nx = bot.group.position.x + moveDir.x * stepLen;
    if (!overlaps(nx, bot.group.position.z)) bot.group.position.x = nx;
    const nz = bot.group.position.z + moveDir.z * stepLen;
    if (!overlaps(bot.group.position.x, nz)) bot.group.position.z = nz;
    bot.yaw = Math.atan2(moveDir.x, moveDir.z);
    bot.group.rotation.y = bot.yaw;
    bot.bobPhase += dt * 9;
    bot.group.position.y = Math.abs(Math.sin(bot.bobPhase)) * 0.04;
    return dist < 0.6;
  }

  function followRoute(bot, dt, speed) {
    if (bot.routeIndex >= bot.route.length) return true;
    const node = WAYPOINTS[bot.route[bot.routeIndex]];
    if (moveToward(bot, node.x, node.z, dt, speed)) bot.routeIndex += 1;
    return bot.routeIndex >= bot.route.length;
  }

  function setRoute(bot, targetNode) {
    const from = nearestNode(bot.group.position);
    bot.route = findRoute(from, targetNode);
    bot.routeIndex = 0;
  }

  // Line of sight from the bot's eye to a point: true when no world mesh
  // stands between them.
  function hasLineOfSight(from, to) {
    toTarget.copy(to).sub(from);
    const dist = toTarget.length();
    if (dist < 0.01) return true;
    raycaster.set(from, toTarget.normalize());
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(map.shootables, false)[0];
    return !hit;
  }

  function visibleEnemy(bot, ctx) {
    eyePos.set(bot.group.position.x, bot.group.position.y + 1.5, bot.group.position.z);
    let best = null;
    let bestDist = VISION_RANGE;
    const candidates = [];
    if (bot.team === 'jackal' && ctx.playerAlive) {
      candidates.push({ kind: 'player', pos: ctx.playerPos, chestY: 1.35, ref: null });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', pos: other.group.position, chestY: 1.35, ref: other });
    }
    for (const candidate of candidates) {
      tmp.set(candidate.pos.x, candidate.pos.y + candidate.chestY, candidate.pos.z);
      const dist = eyePos.distanceTo(tmp);
      if (dist > bestDist) continue;
      toTarget.copy(tmp).sub(eyePos).normalize();
      forwardVec.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
      if (toTarget.dot(forwardVec) < VISION_COS && dist > 3) continue;
      if (!hasLineOfSight(eyePos, tmp)) continue;
      best = candidate;
      bestDist = dist;
    }
    return best ? { candidate: best, dist: bestDist } : null;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      bot.channel = 0;
      bot.channelKind = null;
      return false;
    }
    bot.alive = false;
    bot.health = 0;
    bot.fall = 0;
    bot.channel = 0;
    bot.channelKind = null;
    if (bot.carryingSpike) bot.carryingSpike = false;
    return true;
  }

  function stepBot(bot, dt, ctx, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;

    // Hearing: a shot nearby pulls an idle bot to investigate.
    if (ctx.shots) {
      for (const shot of ctx.shots) {
        const d = Math.hypot(shot.x - bot.group.position.x, shot.z - bot.group.position.z);
        if (d < HEAR_RADIUS && bot.state !== 'engage' && bot.state !== 'defuse' && bot.state !== 'plant') {
          bot.investigate = { x: shot.x, z: shot.z };
          bot.investigateTimer = 0;
          bot.state = 'investigate';
        }
      }
    }

    const seen = visibleEnemy(bot, ctx);
    if (seen) {
      bot.target = seen.candidate;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.aimTime = 0;
        bot.reactAt = time + 0.35 + random() * 0.35;
        bot.burstLeft = 0;
        bot.firePause = 0;
      }
    } else if (bot.state === 'engage') {
      bot.aimTime = 0;
      bot.target = null;
      bot.state = bot.assignment === 'escort' ? 'escort' : 'hold';
      bot.route = [];
    }

    if (bot.state === 'engage' && bot.target) {
      const target = bot.target;
      const tx = target.pos.x;
      const tz = target.pos.z;
      const ty = target.pos.y + target.chestY;
      bot.aimTime += dt;
      // Face the target, strafe while firing.
      bot.yaw = Math.atan2(tx - bot.group.position.x, tz - bot.group.position.z);
      bot.group.rotation.y = bot.yaw;
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.7 + random() * 0.9;
      }
      const sideX = Math.cos(bot.yaw) * bot.strafeDir;
      const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
      const nx = bot.group.position.x + sideX * 1.6 * dt;
      const nz = bot.group.position.z + sideZ * 1.6 * dt;
      if (!overlaps(nx, bot.group.position.z)) bot.group.position.x = nx;
      if (!overlaps(bot.group.position.x, nz)) bot.group.position.z = nz;
      // Fire in bursts once the reaction delay has passed.
      if (time >= bot.reactAt) {
        if (bot.burstLeft > 0) {
          bot.burstGap -= dt;
          if (bot.burstGap <= 0) {
            bot.burstGap = 0.11;
            bot.burstLeft -= 1;
            ctx.fireBotShot(bot, { x: tx, y: ty, z: tz }, target);
          }
        } else {
          bot.firePause -= dt;
          if (bot.firePause <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 4);
            bot.firePause = 0.5 + random() * 0.6;
          }
        }
      }
      return;
    }

    // Spike duties outrank routes.
    if (bot.team === 'jackal' && ctx.spikePlanted) {
      if (bot.state !== 'defuse') {
        bot.state = 'defuse';
        setRoute(bot, ctx.spikeSite === 'A' ? 'aSite' : 'bSite');
      }
      if (followRoute(bot, dt, BOT_SPEED)) {
        const d = Math.hypot(ctx.spikePos.x - bot.group.position.x, ctx.spikePos.z - bot.group.position.z);
        if (d < 2.5) {
          bot.channel += dt;
          bot.channelKind = 'defuse';
          ctx.defuseProgress(bot.channel / DEFUSE_SECONDS);
          if (bot.channel >= DEFUSE_SECONDS) ctx.spikeDefused(bot);
        }
      } else {
        bot.channel = 0;
        bot.channelKind = null;
      }
      return;
    }

    if (bot.carryingSpike && bot.team === 'vanguard') {
      const siteNode = bot.assignment === 'siteB' ? 'bSite' : 'aSite';
      if (bot.state !== 'plant') {
        bot.state = 'plant';
        setRoute(bot, siteNode);
      }
      if (followRoute(bot, dt, BOT_SPEED)) {
        const site = bot.assignment === 'siteB' ? map.sites.B : map.sites.A;
        const inside = Math.abs(bot.group.position.x - site.center.x) < site.half.x
          && Math.abs(bot.group.position.z - site.center.z) < site.half.z;
        if (inside) {
          bot.channel += dt;
          bot.channelKind = 'plant';
          ctx.plantProgress(bot.channel / PLANT_SECONDS, bot.assignment === 'siteB' ? 'B' : 'A');
          if (bot.channel >= PLANT_SECONDS) ctx.spikePlantedBy(bot, bot.assignment === 'siteB' ? 'B' : 'A');
        }
      } else {
        bot.channel = 0;
        bot.channelKind = null;
      }
      return;
    }

    if (bot.state === 'investigate' && bot.investigate) {
      const arrived = moveToward(bot, bot.investigate.x, bot.investigate.z, dt, BOT_SPEED);
      if (arrived) {
        bot.investigateTimer += dt;
        bot.yaw += dt * 1.2;
        bot.group.rotation.y = bot.yaw;
        if (bot.investigateTimer > 2) {
          bot.investigate = null;
          bot.state = bot.assignment === 'escort' ? 'escort' : 'hold';
        }
      }
      return;
    }

    if (bot.assignment === 'escort') {
      // Shadow the player at a loose offset, holding when close.
      const offset = bot.index % 2 === 0 ? { x: -2.5, z: 1.5 } : { x: 2.5, z: 1.5 };
      const tx = ctx.playerPos.x + offset.x;
      const tz = ctx.playerPos.z + offset.z;
      const d = Math.hypot(tx - bot.group.position.x, tz - bot.group.position.z);
      if (d > 3) moveToward(bot, tx, tz, dt, BOT_SPEED);
      else {
        bot.yaw = Math.atan2(ctx.playerPos.x - bot.group.position.x, ctx.playerPos.z - bot.group.position.z);
        bot.group.rotation.y = bot.yaw;
      }
      return;
    }

    if (bot.state === 'hold' || bot.state === 'route') {
      if (bot.route.length === 0) {
        bot.state = 'hold';
        bot.holdTimer += dt;
        bot.yaw += Math.sin(bot.holdTimer * 0.5) * dt * 0.6;
        bot.group.rotation.y = bot.yaw;
        return;
      }
      bot.state = 'route';
      followRoute(bot, dt, bot.assignment === 'roam' ? BOT_SPEED : HOLD_SPEED);
    }
  }

  function step(dt, ctx, time) {
    for (const bot of bots) stepBot(bot, dt, ctx, time);
    // Separation: bots never stand inside each other.
    for (let i = 0; i < bots.length; i += 1) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j += 1) {
        const b = bots[j];
        if (!b.alive) continue;
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          if (!overlaps(a.group.position.x - nx * push, a.group.position.z - nz * push)) {
            a.group.position.x -= nx * push;
            a.group.position.z -= nz * push;
          }
          if (!overlaps(b.group.position.x + nx * push, b.group.position.z + nz * push)) {
            b.group.position.x += nx * push;
            b.group.position.z += nz * push;
          }
        }
      }
    }
  }

  function assign(round) {
    // Jackals: two hold A, two hold B, one roams mid.
    const jackals = bots.filter((b) => b.team === 'jackal');
    const holds = [
      { node: 'aSite', kind: 'hold' },
      { node: 'aLongNorth', kind: 'hold' },
      { node: 'bSite', kind: 'hold' },
      { node: 'bCorrNorth', kind: 'hold' },
      { node: 'mid', kind: 'roam' },
    ];
    jackals.forEach((bot, i) => {
      bot.assignment = holds[i].kind;
      bot.holdNode = holds[i].node;
      setRoute(bot, holds[i].node);
      bot.state = 'route';
    });
    // Vanguard: two escort the player, two push a site (alternating by round).
    const vanguards = bots.filter((b) => b.team === 'vanguard');
    const pushSite = round % 2 === 1 ? 'aSite' : 'bSite';
    vanguards.forEach((bot, i) => {
      if (i < 2) {
        bot.assignment = 'escort';
        bot.state = 'escort';
      } else {
        bot.assignment = pushSite === 'aSite' ? 'siteA' : 'siteB';
        bot.state = 'route';
        setRoute(bot, pushSite);
      }
    });
  }

  function reset(round) {
    for (const bot of bots) {
      const spawns = bot.team === 'vanguard' ? map.spawns.vanguard : map.spawns.jackal;
      const at = spawns[bot.index + (bot.team === 'vanguard' ? 1 : 0)] ?? spawns[0];
      bot.group.position.copy(at);
      bot.group.position.y = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.target = null;
      bot.aimTime = 0;
      bot.burstLeft = 0;
      bot.firePause = 0;
      bot.investigate = null;
      bot.carryingSpike = false;
      bot.channel = 0;
      bot.channelKind = null;
      bot.route = [];
      bot.routeIndex = 0;
    }
    assign(round);
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    damage,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.carryingSpike && b.alive) ?? null;
    },
    spikeDropAt(pos) {
      // Nearest living Vanguard bot goes to fetch the dropped spike.
      let best = null;
      let bestDist = Infinity;
      for (const bot of bots) {
        if (bot.team !== 'vanguard' || !bot.alive) continue;
        const d = Math.hypot(bot.group.position.x - pos.x, bot.group.position.z - pos.z);
        if (d < bestDist) {
          bestDist = d;
          best = bot;
        }
      }
      if (!best) return;
      best.state = 'fetch';
      best.fetchPos = { x: pos.x, z: pos.z };
    },
    fetchStep(dt, ctx) {
      for (const bot of bots) {
        if (bot.state !== 'fetch' || !bot.alive) continue;
        const arrived = moveToward(bot, bot.fetchPos.x, bot.fetchPos.z, dt, BOT_SPEED);
        if (arrived) {
          bot.carryingSpike = true;
          bot.state = 'plant';
          bot.route = [];
          ctx.spikePickedUp(bot);
        }
      }
    },
  };
}
