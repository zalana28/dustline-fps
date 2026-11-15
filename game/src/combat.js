// Combat: the player's hitscan shots, the tracer pool, and the grenades.
// One raycaster is reused for every shot, so the hot path allocates nothing.
// A shot fires one ray per pellet; the ray stops at the first world mesh or
// bot hit mesh, and damage falls off with distance. Bot bullets resolve
// through the same raycaster from the bot's eye.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createCombat(scene, map, bots, audio) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const end = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const tracerDir = new THREE.Vector3();
  const tracerMid = new THREE.Vector3();
  const tmpFrom = new THREE.Vector3();

  // Tracers are thin stretched boxes, not 1px lines: a bright streak the
  // eye can follow. The pool is reused, so firing allocates nothing.
  const tracerGeo = new THREE.BoxGeometry(1, 0.02, 0.02);
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0,
    }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }

  const flashGeo = new THREE.SphereGeometry(0.9, 12, 8);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb066'), transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.visible = false;
  scene.add(flash);

  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f3a2c'), roughness: 0.6, metalness: 0.4 });

  function spawnTracer(from, to) {
    const tracer = tracers.find((t) => t.life <= 0) ?? tracers[0];
    tracerDir.copy(to).sub(from);
    const length = tracerDir.length();
    if (length < 0.05) return;
    tracerDir.normalize();
    // Start the streak ahead of the muzzle, not at the camera plane: a box
    // that begins at the lens reads as a triangle under perspective.
    const start = tmpFrom.copy(from).addScaledVector(tracerDir, 0.6);
    tracerMid.copy(start).add(to).multiplyScalar(0.5);
    tracer.mesh.position.copy(tracerMid);
    tracer.mesh.quaternion.setFromUnitVectors(xAxis, tracerDir);
    tracer.mesh.scale.set(Math.max(0.1, start.distanceTo(to)), 1, 1);
    tracer.mesh.material.opacity = 0.9;
    tracer.mesh.visible = true;
    tracer.life = 0.07;
  }

  function stepTracers(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
    if (flash.visible) {
      flashMat.opacity = Math.max(0, flashMat.opacity - dt * 4);
      if (flashMat.opacity <= 0) flash.visible = false;
    }
  }

  function falloff(damage, dist, range) {
    if (dist <= range * 0.4) return damage;
    const t = Math.min(1, (dist - range * 0.4) / (range * 0.6));
    return damage * (1 - t * 0.55);
  }

  // One hitscan pellet from the camera. Returns what it hit, if anything.
  function shoot(camera, def, spread, onHit) {
    origin.copy(camera.position);
    direction.set(
      (Math.random() * 2 - 1) * spread,
      (Math.random() * 2 - 1) * spread,
      -1,
    ).applyQuaternion(camera.quaternion).normalize();
    raycaster.set(origin, direction);
    const worldHit = raycaster.intersectObjects(map.shootables, false)[0];
    const botHit = raycaster.intersectObjects(bots.hitMeshes, false)[0];
    let point;
    let dist = def.range;
    let hitBot = null;
    let part = null;
    if (botHit && (!worldHit || botHit.distance < worldHit.distance)) {
      point = botHit.point;
      dist = botHit.distance;
      hitBot = botHit.object.userData.bot;
      part = botHit.object.userData.part;
    } else if (worldHit) {
      point = worldHit.point;
      dist = worldHit.distance;
    } else {
      end.copy(origin).addScaledVector(direction, def.range);
      point = end;
    }
    spawnTracer(origin, point);
    if (hitBot) {
      let damage = falloff(def.damage, dist, def.range);
      if (part === 'head') damage *= def.headMult;
      const killed = bots.damage(hitBot, damage, part);
      onHit({ kind: 'bot', bot: hitBot, part, damage, killed, point });
      return { kind: 'bot', bot: hitBot, part, damage, killed, point };
    }
    if (worldHit) {
      onHit({ kind: 'world', point, dist });
      return { kind: 'world', point, dist };
    }
    return { kind: 'none', point };
  }

  // A bot's bullet: the same raycast from the bot's eye toward its target,
  // with an aim error that shrinks the longer the bot has held the target.
  function botShoot(bot, targetPos, target, ctx) {
    eyePos.copy(bot.group.position);
    eyePos.y += 1.45;
    const dist = eyePos.distanceTo(targetPos);
    const targetSpeed = target.kind === 'player' ? ctx.playerSpeed : 2;
    const error = 0.028 + dist * 0.0006 + targetSpeed * 0.004 - Math.min(0.018, bot.aimTime * 0.004);
    direction.copy(targetPos).sub(eyePos).normalize();
    direction.x += (Math.random() * 2 - 1) * error;
    direction.y += (Math.random() * 2 - 1) * error;
    direction.z += (Math.random() * 2 - 1) * error;
    direction.normalize();
    raycaster.set(eyePos, direction);
    const worldHit = raycaster.intersectObjects(map.shootables, false)[0];
    let point = null;
    let hitPlayer = false;
    let hitBot = null;
    let part = null;
    if (target.kind === 'player') {
      const playerHit = raycaster.intersectObjects(ctx.playerHitMeshes, false)[0];
      if (playerHit && (!worldHit || playerHit.distance < worldHit.distance)) {
        point = playerHit.point;
        hitPlayer = true;
        part = playerHit.object.userData.part;
      }
    } else if (target.ref) {
      const meshes = [target.ref.torso, target.ref.head];
      const enemyHit = raycaster.intersectObjects(meshes, false)[0];
      if (enemyHit && (!worldHit || enemyHit.distance < worldHit.distance)) {
        point = enemyHit.point;
        hitBot = target.ref;
        part = enemyHit.object.userData.part;
      }
    }
    if (!point) {
      if (worldHit) point = worldHit.point;
      else point = end.copy(eyePos).addScaledVector(direction, Math.min(dist + 4, 60));
    }
    spawnTracer(eyePos, point);
    audio.enemyShot(dist);
    if (hitPlayer) {
      let damage = BOT_DAMAGE * (1 - Math.min(0.5, dist / 80));
      if (part === 'head') damage *= 2;
      ctx.damagePlayer(damage, part, bot);
    } else if (hitBot) {
      let damage = BOT_DAMAGE * (1 - Math.min(0.5, dist / 80));
      if (part === 'head') damage *= 2.5;
      const killed = bots.damage(hitBot, damage, part);
      ctx.botKill(bot, hitBot, part, killed);
    }
  }

  function throwGrenade(from, directionVec, ctx) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    grenades.push({
      mesh,
      velocity: directionVec.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5.5, 0)),
      fuse: 1.6,
      ctx,
    });
  }

  function explode(grenade) {
    const pos = grenade.mesh.position.clone();
    flash.position.copy(pos);
    flash.visible = true;
    flashMat.opacity = 0.95;
    flash.scale.setScalar(1);
    audio.explosion();
    const radius = 6.5;
    // Bots caught in the blast.
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = bot.group.position.distanceTo(pos);
      if (d < radius) {
        const damage = 100 * (1 - d / radius);
        const killed = bots.damage(bot, damage, 'torso');
        grenade.ctx.grenadeKill(bot, damage, killed);
      }
    }
    // The player, if too close.
    const playerDist = grenade.ctx.playerPos.distanceTo(pos);
    if (playerDist < radius) {
      grenade.ctx.damagePlayer(90 * (1 - playerDist / radius), 'torso', null);
    }
    scene.remove(grenade.mesh);
  }

  function stepGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const grenade = grenades[i];
      grenade.fuse -= dt;
      grenade.velocity.y -= 18 * dt;
      const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
      // Ground bounce.
      if (next.y < 0.11) {
        next.y = 0.11;
        grenade.velocity.y *= -0.4;
        grenade.velocity.x *= 0.7;
        grenade.velocity.z *= 0.7;
      }
      // Wall bounce: reflect the axis that ran into a collider.
      const box = new THREE.Box3(
        new THREE.Vector3(next.x - 0.11, next.y - 0.11, next.z - 0.11),
        new THREE.Vector3(next.x + 0.11, next.y + 0.11, next.z + 0.11),
      );
      for (const collider of map.colliders) {
        if (!box.intersectsBox(collider)) continue;
        if (Math.abs(grenade.velocity.x) > Math.abs(grenade.velocity.z)) grenade.velocity.x *= -0.5;
        else grenade.velocity.z *= -0.5;
        break;
      }
      grenade.mesh.position.copy(next);
      if (grenade.fuse <= 0) {
        explode(grenade);
        grenades.splice(i, 1);
      }
    }
  }

  const eyePos = new THREE.Vector3();

  return {
    shoot,
    botShoot,
    throwGrenade,
    spawnTracer,
    step(dt) {
      stepTracers(dt);
      stepGrenades(dt);
    },
  };
}
