// Weapons: the buy menu's catalogue and the firing model. Each definition
// owns its numbers — price, damage, fire rate, magazine, spread, recoil and
// the sound kind — and the view model is built from boxes in the same file.
// main.js owns the ray and the damage; this file owns the trigger, the
// reload, the muzzle flash and the spread that punishes firing on the move.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, kind: 'pistol', auto: false,
    mag: 12, reserve: 36, gap: 0.18, reloadTime: 1.4,
    damage: 26, headMult: 3, pellets: 1,
    spreadStill: 0.004, spreadMoving: 0.03, recoil: 0.011, range: 60,
  },
  smg: {
    id: 'smg', name: 'VEX-9 SMG', price: 900, kind: 'smg', auto: true,
    mag: 30, reserve: 90, gap: 0.075, reloadTime: 1.7,
    damage: 22, headMult: 3, pellets: 1,
    spreadStill: 0.006, spreadMoving: 0.045, recoil: 0.008, range: 45,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Dune', price: 2400, kind: 'rifle', auto: true,
    mag: 25, reserve: 75, gap: 0.1, reloadTime: 2.0,
    damage: 34, headMult: 3, pellets: 1,
    spreadStill: 0.003, spreadMoving: 0.032, recoil: 0.014, range: 80,
  },
  shotgun: {
    id: 'shotgun', name: 'BREACH-12', price: 1600, kind: 'shotgun', auto: false,
    mag: 6, reserve: 18, gap: 0.85, reloadTime: 2.6,
    damage: 12, headMult: 3, pellets: 8,
    spreadStill: 0.05, spreadMoving: 0.07, recoil: 0.035, range: 22,
  },
  marksman: {
    id: 'marksman', name: 'LONGSHOT', price: 3800, kind: 'marksman', auto: false,
    mag: 5, reserve: 15, gap: 1.1, reloadTime: 2.8,
    damage: 88, headMult: 3, pellets: 1,
    spreadStill: 0.0008, spreadMoving: 0.02, recoil: 0.03, range: 120,
  },
};

export const GRENADE = { id: 'grenade', name: 'Frag Grenade', price: 300, max: 2 };
export const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650 };

export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'marksman', 'grenade', 'armor'];

const VIEW_MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.26], barrel: [0.04, 0.04, 0.16], grip: [0.06, 0.12, 0.08], at: [0.22, -0.19, -0.34] },
  smg: { receiver: [0.08, 0.09, 0.36], barrel: [0.04, 0.04, 0.3], grip: [0.06, 0.1, 0.08], at: [0.23, -0.2, -0.4] },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], grip: [0.075, 0.08, 0.22], at: [0.24, -0.2, -0.42] },
  shotgun: { receiver: [0.09, 0.1, 0.5], barrel: [0.05, 0.05, 0.46], grip: [0.07, 0.09, 0.2], at: [0.24, -0.2, -0.44] },
  marksman: { receiver: [0.08, 0.09, 0.5], barrel: [0.035, 0.035, 0.55], grip: [0.07, 0.08, 0.24], at: [0.24, -0.2, -0.46] },
};

export function createWeaponRig(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const models = {};
  for (const [id, spec] of Object.entries(VIEW_MODELS)) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), gripMat);
    barrel.position.set(0, 0.025, -(spec.receiver[2] / 2 + spec.barrel[2] / 2 - 0.04));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.grip), gripMat);
    stock.position.set(0, -0.02, spec.receiver[2] / 2 + 0.05);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.12), accentMat);
    stripe.position.set(0, 0.055, 0);
    model.add(receiver, barrel, stock, stripe);
    model.position.set(...spec.at);
    model.scale.setScalar(0.62);
    model.visible = false;
    camera.add(model);
    models[id] = model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.15, -0.13, -0.62);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.15, -0.12, -0.45);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = VIEW_MODELS[state.current].at[2] + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.045 + def().recoil;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      return d.spreadStill + moving * d.spreadMoving;
    },
    equip(id) {
      const d = WEAPONS[id];
      if (!d) return false;
      models[state.current].visible = false;
      state.current = id;
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      models[id].visible = true;
      return true;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetToPistol() {
      this.equip('pistol');
    },
  };
}
