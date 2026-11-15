// The map: DUSTLINE compound, an original dusk desert site. Two spike sites
// (A west yard, B east warehouse), a mid lane, a long A lane and a B corridor,
// built from boxes. Every box is a collider for movement and a surface a
// bullet stops on. Plain geometry only, no models and no textures; site
// letters are drawn on a canvas at runtime, so no image files are needed.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph for the bots: nodes the routes run through, edges they can
// walk. Every edge is a straight line with no wall between its ends.
export const WAYPOINTS = {
  vSpawn: { x: 0, z: 12.5 },
  midSouth: { x: 0, z: 6 },
  mid: { x: 0, z: 0 },
  midNorth: { x: 0, z: -6 },
  midWest: { x: -8, z: 0 },
  midEast: { x: 8, z: 0 },
  aLongSouth: { x: -16, z: 8 },
  aLongMid: { x: -16, z: 0 },
  aLongNorth: { x: -16, z: -8 },
  aSite: { x: -15.5, z: -11 },
  aConnector: { x: -8, z: -8 },
  bCorrSouth: { x: 16, z: 8 },
  bCorrMid: { x: 16, z: 0 },
  bCorrNorth: { x: 16, z: -8 },
  bSite: { x: 15.5, z: -11 },
  bConnector: { x: 8, z: -8 },
  jSpawn: { x: 0, z: -12.5 },
};

export const EDGES = {
  vSpawn: ['midSouth', 'aLongSouth', 'bCorrSouth'],
  midSouth: ['vSpawn', 'mid', 'aLongSouth', 'bCorrSouth'],
  mid: ['midSouth', 'midNorth', 'midWest', 'midEast'],
  midNorth: ['mid', 'aConnector', 'bConnector', 'jSpawn'],
  midWest: ['mid', 'aLongMid', 'aConnector'],
  midEast: ['mid', 'bCorrMid', 'bConnector'],
  aLongSouth: ['vSpawn', 'midSouth', 'aLongMid'],
  aLongMid: ['aLongSouth', 'aLongNorth', 'midWest'],
  aLongNorth: ['aLongMid', 'aSite', 'aConnector'],
  aSite: ['aLongNorth', 'aConnector'],
  aConnector: ['aSite', 'aLongNorth', 'midNorth', 'midWest'],
  bCorrSouth: ['vSpawn', 'midSouth', 'bCorrMid'],
  bCorrMid: ['bCorrSouth', 'bCorrNorth', 'midEast'],
  bCorrNorth: ['bCorrMid', 'bSite', 'bConnector'],
  bSite: ['bCorrNorth', 'bConnector'],
  bConnector: ['bSite', 'bCorrNorth', 'midNorth', 'midEast'],
  jSpawn: ['midNorth'],
};

// Breadth-first route between two waypoints; returns the node names in order.
export function findRoute(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of EDGES[node] ?? []) {
      if (prev[next] !== undefined) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (prev[at] !== null) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [from, to];
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sandDark), roughness: 1, metalness: 0 }),
    sand: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 1, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2d20'), roughness: 0.95, metalness: 0.02 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9, metalness: 0.05 }),
    rust: new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a4a28'), roughness: 0.85, metalness: 0.15 }),
    steel: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d454e'), roughness: 0.6, metalness: 0.45 }),
    accent: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.7, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 }),
    siteA: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ally), roughness: 0.8, transparent: true, opacity: 0.22, emissive: new THREE.Color(PALETTE.ally), emissiveIntensity: 0.35, depthWrite: false }),
    siteB: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.8, transparent: true, opacity: 0.22, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35, depthWrite: false }),
  };

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground: one big sand slab, plus a darker apron under each site.
  box(42, 0.4, 30, 0, -0.2, 0, 'ground');
  box(10, 0.06, 11, -15, 0.03, -9.5, 'sand', false);
  box(10, 0.06, 11, 15, 0.03, -9.5, 'sand', false);

  // Perimeter walls, 4.2 m high, open to the dusk sky.
  box(0.6, 4.2, 30, -20.3, 2.1, 0, 'wall');
  box(0.6, 4.2, 30, 20.3, 2.1, 0, 'wall');
  box(42, 4.2, 0.6, 0, 2.1, -14.3, 'wall');
  box(42, 4.2, 0.6, 0, 2.1, 14.3, 'wall');

  // Site A yard (west): low crates to crouch behind, a tall stack, a pillar.
  box(2.2, 1.1, 2.2, -15.5, 0.55, -6.5, 'crate');
  box(1.4, 1.1, 1.4, -18, 0.55, -11.5, 'crate');
  box(1.4, 2.2, 1.4, -12.5, 1.1, -12, 'rust');
  box(1.2, 3.4, 1.2, -18.5, 1.7, -6, 'wall');
  box(3.2, 1.1, 1.2, -13, 0.55, -8.6, 'crate');

  // Site B warehouse (east): two containers and a low wall.
  box(4.8, 2.4, 2.2, 17.5, 1.2, -11.5, 'steel');
  box(2.2, 2.4, 4.8, 12.5, 1.2, -11, 'rust');
  box(3.4, 1.1, 1.2, 15.5, 0.55, -6.8, 'crate');

  // Mid: a broken pillar and two crates splitting the lane.
  box(1.4, 3.6, 1.4, 0, 1.8, 0, 'wall');
  box(2.0, 1.1, 1.2, -5, 0.55, 2.5, 'crate');
  box(2.0, 1.1, 1.2, 5, 0.55, -2.5, 'crate');
  box(1.2, 0.7, 1.2, -3.4, 0.35, -4.5, 'rust');
  box(1.2, 0.7, 1.2, 3.4, 0.35, 4.5, 'rust');

  // Long A lane cover and B corridor cover.
  box(1.2, 1.1, 2.6, -16, 0.55, 3.5, 'crate');
  box(2.4, 1.1, 1.2, -18.2, 0.55, 1, 'crate');
  box(1.2, 1.1, 2.6, 16, 0.55, 3.5, 'crate');
  box(2.4, 1.1, 1.2, 18.2, 0.55, 1, 'crate');

  // South spawn cover: two low walls the attackers start behind.
  box(3.0, 1.1, 1.0, -6, 0.55, 11, 'crate');
  box(3.0, 1.1, 1.0, 6, 0.55, 11, 'crate');

  // Site zone markers: glowing floor plates.
  const plateA = box(9, 0.05, 10, -15.5, 0.06, -9.5, 'siteA', false);
  plateA.receiveShadow = false;
  const plateB = box(9, 0.05, 10, 15.5, 0.06, -9.5, 'siteB', false);
  plateB.receiveShadow = false;

  // Site letters, drawn on a canvas at runtime so no image files are needed.
  function letterSign(letter, x, z, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = color;
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    sign.position.set(x, 3.4, z);
    group.add(sign);
    return sign;
  }
  letterSign('A', -15.5, -13.6, '#4fae8d');
  letterSign('B', 15.5, -13.6, '#e07830');

  // Dusk light: a low warm sun from the west, cool sky fill, warm bounce.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a63'), new THREE.Color(PALETTE.canvas), 1.3);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.8);
  sun.position.set(-18, 10, 12);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 0.5);
  fill.position.set(14, 9, -10);
  scene.add(fill);

  // Site beacons: a soft glow over each site so the objective reads at a glance.
  const beaconA = new THREE.PointLight(new THREE.Color(PALETTE.ally), 6, 14);
  beaconA.position.set(-15.5, 3.5, -9.5);
  scene.add(beaconA);
  const beaconB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 14);
  beaconB.position.set(15.5, 3.5, -9.5);
  scene.add(beaconB);

  // Dusk sky dome: a vertical gradient painted on a canvas at runtime, so
  // the horizon glows warm while the zenith stays dark. No image files.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 16;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  // Canvas top maps to the zenith (flipY), so the bright band sits at the
  // middle of the canvas: the horizon, at eye level.
  gradient.addColorStop(0.0, '#140e0b');
  gradient.addColorStop(0.3, '#241610');
  gradient.addColorStop(0.44, '#8a4a24');
  gradient.addColorStop(0.5, '#e08a3e');
  gradient.addColorStop(0.56, '#7a4522');
  gradient.addColorStop(0.66, '#2a1a12');
  gradient.addColorStop(1.0, '#171209');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 16, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { center: new THREE.Vector3(-15.5, 0, -9.5), half: { x: 4.5, z: 5 } },
      B: { center: new THREE.Vector3(15.5, 0, -9.5), half: { x: 4.5, z: 5 } },
    },
    spawns: {
      vanguard: [
        new THREE.Vector3(-3, 0, 12.5),
        new THREE.Vector3(-1, 0, 12.5),
        new THREE.Vector3(1, 0, 12.5),
        new THREE.Vector3(3, 0, 12.5),
        new THREE.Vector3(0, 0, 11),
      ],
      jackal: [
        new THREE.Vector3(-6, 0, -12.5),
        new THREE.Vector3(-3, 0, -12.5),
        new THREE.Vector3(0, 0, -12.5),
        new THREE.Vector3(3, 0, -12.5),
        new THREE.Vector3(6, 0, -12.5),
      ],
    },
  };
}
