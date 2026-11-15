# dustline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/zalana28/dustline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/zalana28/dustline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE is a round-based tactical FPS in the Counter-Strike style: two teams, short rounds won by eliminating the other team or by planting and defending the spike, money between rounds to buy weapons, and gunfire where accuracy counts more than speed. Single-player against bots, built on three.js 0.187.0, no build step, no network.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play: WASD to move, mouse to look, click to fire, R to reload, Ctrl to crouch, B for the buy menu, G to throw a grenade, E to plant or defuse the spike.

## The game

- **Rounds:** Vanguard attacks, Jackals defend. Plant the spike at site A or B and hold it until it detonates, or eliminate the whole Jackal team. First to 5 round wins takes the match.
- **Money:** earn cash every round for wins, kills and plants, and spend it in the buy menu: pistol, SMG, rifle, shotgun, marksman rifle, frag grenades and armor.
- **Gunplay:** hitscan with headshot damage, recoil and spread that punish firing on the move, acceleration-based movement, crouching and full collision with the map.
- **Bots:** four Vanguard teammates and five Jackal defenders that follow routes through the map, hold angles, react to gunfire they hear, plant and defuse the spike.
- **Map:** an original dusk desert compound — two spike sites, a mid lane, a long A lane and a B corridor, with crates, containers and sightlines worth playing.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library. Two runs write identical bytes.

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=n0w15zdz&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
