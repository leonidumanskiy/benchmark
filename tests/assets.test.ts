// Contract between the Blender HD pipeline (assets-src/) and the procedural rigs the game animates.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PLAYER_RIG } from '../src/assets/player';
import { MONSTER_RIG } from '../src/assets/monster';
import playerSpec from '../assets-src/specs/player.json';
import monsterSpec from '../assets-src/specs/monster.json';
import envSpec from '../assets-src/specs/envkit.json';

const strip = (o: Record<string, unknown>) => { const { note, scale, ...rest } = o as any; void note; void scale; return JSON.parse(JSON.stringify(rest)); };

describe('HD asset pipeline contract', () => {
  it('player spec rig matches the procedural player rig', () => {
    expect(strip(playerSpec.rig)).toEqual(JSON.parse(JSON.stringify(PLAYER_RIG)));
  });
  it('monster spec rig matches the procedural monster rig', () => {
    const tsRig = JSON.parse(JSON.stringify(MONSTER_RIG));
    tsRig.legs = tsRig.legs.map(({ side, ...l }: any) => { void side; return l; });
    expect(strip(monsterSpec.rig)).toEqual(tsRig);
  });
  it('built GLBs exist and are newer than nothing missing in the manifest', () => {
    const m = JSON.parse(fs.readFileSync('public/assets/hd/manifest.json', 'utf8'));
    for (const k of ['player', 'monster', 'envkit', 'floor']) {
      expect(m.assets[k], k).toBeTruthy();
      expect(fs.existsSync(`public/assets/hd/${k}.glb`), k).toBe(true);
    }
    // the kit exposes every module the game fits onto obstacles
    const mods = m.assets.envkit.modules as string[];
    for (const need of ['wall_a', 'wall_b', 'wall_c', 'barricade', 'barricade_end', 'gate', 'crate_a', 'crate_b', 'pylon', 'rock_a', 'rock_b', 'lamp_red', 'barrel']) expect(mods).toContain(need);
    expect(Object.keys(envSpec.modules)).toEqual(expect.arrayContaining(['wall', 'barricade', 'gate', 'crate', 'pylon']));
  });
  it('every slot used for runtime effects exists in the monster spec', () => {
    for (const s of ['shell', 'shellDark', 'flesh', 'glow', 'eye', 'spike', 'teeth']) expect(Object.keys(monsterSpec.slots)).toContain(s);
  });
});
