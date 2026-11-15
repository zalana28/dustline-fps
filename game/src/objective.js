// The spike: the objective. The player carries it; inside a site, holding E
// plants it over three seconds. A planted spike ticks for thirty-five
// seconds, beeping faster as it goes, and any living Jackal that reaches it
// defuses it over five seconds — interrupted by damage or death. The spike
// itself is a small blinking box; the fuse is a light that grows as the
// countdown runs down.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const FUSE_SECONDS = 35;

export function createObjective(scene, map) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.16, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(PALETTE.foe), emissiveIntensity: 0.5 }),
  );
  body.position.y = 0.08;
  const light = new THREE.PointLight(new THREE.Color(PALETTE.foe), 0, 8);
  light.position.y = 0.4;
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    holder: 'player', // 'player' | 'bot' | 'dropped' | 'planted'
    site: null,
    position: null,
    plantProgress: 0,
    fuseLeft: 0,
    defuseProgress: 0,
    beepTimer: 0,
  };

  function inSite(pos) {
    for (const [name, site] of Object.entries(map.sites)) {
      if (Math.abs(pos.x - site.center.x) < site.half.x && Math.abs(pos.z - site.center.z) < site.half.z) return name;
    }
    return null;
  }

  return {
    state,
    inSite,
    plantSeconds: PLANT_SECONDS,
    fuseSeconds: FUSE_SECONDS,
    dropAt(pos) {
      state.holder = 'dropped';
      state.position = pos.clone();
      state.position.y = 0;
      state.plantProgress = 0;
      group.position.copy(state.position);
      group.visible = true;
    },
    pickUpByPlayer() {
      state.holder = 'player';
      state.position = null;
      group.visible = false;
    },
    pickUpByBot(bot) {
      state.holder = 'bot';
      state.position = null;
      group.visible = false;
    },
    // The player holds E inside a site: returns the site while channelling.
    plantStep(dt, playerPos, holding) {
      if (state.holder !== 'player') {
        state.plantProgress = 0;
        return null;
      }
      const site = inSite(playerPos);
      if (!site || !holding) {
        state.plantProgress = 0;
        return site;
      }
      state.plantProgress += dt;
      return site;
    },
    plantDone() {
      return state.plantProgress >= PLANT_SECONDS;
    },
    plantAt(site, pos) {
      state.holder = 'planted';
      state.site = site;
      state.position = pos.clone();
      state.position.y = 0;
      state.fuseLeft = FUSE_SECONDS;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      group.position.copy(state.position);
      group.visible = true;
    },
    step(dt, audio, onDetonate) {
      if (state.holder !== 'planted') return;
      state.fuseLeft -= dt;
      // The blink and the beep accelerate as the fuse runs down.
      const urgency = 1 - state.fuseLeft / FUSE_SECONDS;
      const interval = 0.9 - urgency * 0.65;
      state.beepTimer -= dt;
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        audio.plantBeep();
      }
      light.intensity = 2 + urgency * 6 + Math.sin(state.fuseLeft * 12) * 1.5;
      if (state.fuseLeft <= 0) {
        group.visible = false;
        onDetonate();
      }
    },
    reset() {
      state.holder = 'player';
      state.site = null;
      state.position = null;
      state.plantProgress = 0;
      state.fuseLeft = 0;
      state.defuseProgress = 0;
      group.visible = false;
    },
  };
}
