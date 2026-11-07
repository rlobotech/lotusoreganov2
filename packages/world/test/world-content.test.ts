import { describe, expect, it } from 'vitest';
import { partyAtLevel } from '../src/balance.ts';
import { TIERS } from '../src/high-world.ts';
import { findPath, isPassable, zoneAt } from '../src/hex.ts';
import { MONSTERS } from '../src/monsters.ts';
import { objectiveTarget } from '../src/quests.ts';
import { advance, defaultConfig } from '../src/sim.ts';
import { SKILLS } from '../src/skills.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { EncounterDef } from '../src/types.ts';

const allEncounters = (): EncounterDef[] => [
  ...Object.values(W.zones).flatMap((z) => z.encounters),
  ...Object.values(W.sites).flatMap((s) => s.dungeon?.stages.map((st) => st.encounter) ?? []),
];

describe('the world', () => {
  it('has terrain and zone data for every hex, and a taller map for the high regions', () => {
    expect(W.terrain).toHaveLength(W.width * W.height);
    expect(W.zoneOf).toHaveLength(W.width * W.height);
    expect(W.height).toBe(10 + TIERS.length * 10);
    for (const z of W.zoneOf) expect(W.zones[z], z).toBeDefined();
  });

  it('zones cover levels 1 to 100 in order without gaps or overlaps', () => {
    const zones = Object.values(W.zones).sort((a, b) => a.minLevel - b.minLevel);
    expect(zones[0]!.minLevel).toBe(1);
    expect(zones[zones.length - 1]!.maxLevel).toBe(100);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i]!.minLevel, zones[i]!.id).toBe(zones[i - 1]!.maxLevel + 1);
    }
  });

  it('every encounter uses real monsters, and every monster skill exists', () => {
    for (const e of allEncounters()) {
      for (const m of e.monsters)
        expect(MONSTERS[m.template], `${e.id}: ${m.template}`).toBeDefined();
    }
    for (const t of Object.values(MONSTERS)) {
      for (const s of t.skills) expect(SKILLS[s], `${t.id}: ${s}`).toBeDefined();
      for (const r of t.ai) {
        if (r.skill !== 'weapon_attack') expect(t.skills, `${t.id}: ${r.skill}`).toContain(r.skill);
      }
    }
  });

  it('every site sits on passable ground of the right region and is reachable by road', () => {
    const cleared = Object.values(W.sites)
      .filter((s) => s.kind !== 'city')
      .map((s) => s.id);
    const start = W.sites[W.startCity]!;
    for (const site of Object.values(W.sites)) {
      expect(isPassable(W, site, cleared), site.id).toBe(true);
      const path = findPath(W, start, site, cleared, 10);
      expect(path, `${site.id} is unreachable`).not.toBeNull();
    }
    // Each high region's sites are inside its own zone.
    for (const t of TIERS) {
      for (const id of [`${t.id}_city`, `${t.id}_dungeon`, `${t.id}_boss`]) {
        expect(zoneAt(W, W.sites[id]!), id).toBe(t.id);
      }
    }
  });

  it('the high regions stay closed until the previous boss falls', () => {
    const first = TIERS[0]!;
    expect(W.zones[first.id]!.unlockedBy).toBe('old_crypt');
    TIERS.slice(1).forEach((t, i) => {
      expect(W.zones[t.id]!.unlockedBy).toBe(`${TIERS[i]!.id}_boss`);
    });
    const city = W.sites[`${first.id}_city`]!;
    expect(findPath(W, W.sites[W.startCity]!, city, [], 10)).toBeNull();
    expect(findPath(W, W.sites[W.startCity]!, city, ['old_crypt'], 10)).not.toBeNull();
  });

  it('boss dungeons end on a boss and need their quest', () => {
    for (const t of TIERS) {
      const site = W.sites[`${t.id}_boss`]!;
      expect(site.requiresQuest).toBe(`${t.id}_boss`);
      expect(W.quests[site.requiresQuest!]).toBeDefined();
      const stages = site.dungeon!.stages;
      expect(stages[stages.length - 1]!.boss).toBe(true);
      const last = stages[stages.length - 1]!.encounter.monsters[0]!.template;
      expect(last).toBe(t.finalBoss ?? t.boss);
    }
  });

  it('the quest chain is consistent and can be completed in order', () => {
    const done = new Set<string>();
    const pending = new Set(Object.keys(W.quests));
    // Repeatedly complete every quest whose requirements are done: nothing may stay stuck.
    for (let round = 0; round < 60 && pending.size; round++) {
      for (const id of [...pending]) {
        const q = W.quests[id]!;
        for (const r of q.requires ?? []) expect(W.quests[r], `${id} needs ${r}`).toBeDefined();
        if ((q.requires ?? []).every((r) => done.has(r))) {
          done.add(id);
          pending.delete(id);
        }
      }
    }
    expect([...pending]).toEqual([]);

    for (const q of Object.values(W.quests)) {
      expect(q.reward.gold).toBeGreaterThan(0);
      for (const o of q.objectives ?? []) {
        expect(objectiveTarget(o)).toBeGreaterThan(0);
        if (o.type === 'kill') {
          const where = Object.values(W.zones).some((z) =>
            z.encounters.some((e) => e.monsters.some((m) => m.template === o.template)),
          );
          expect(where, `${q.id}: ${o.template}`).toBe(true);
        } else {
          expect(W.sites[o.siteId], `${q.id}: ${o.siteId}`).toBeDefined();
        }
      }
    }
  });

  it('every region has a city with a level-appropriate shop', () => {
    for (const t of TIERS) {
      const city = W.sites[`${t.id}_city`]!;
      expect(city.shop!.length).toBeGreaterThan(8);
      const mid = Math.round((t.minLevel + t.maxLevel) / 2);
      for (const s of city.shop!) expect(s.itemLevel).toBe(mid);
    }
  });
});

describe('playing the high regions', () => {
  const cfg = { ...defaultConfig(60_000), maxSteps: 4000 };

  function partyIn(tier: number, level: number) {
    const p = partyAtLevel(level);
    const t = TIERS[tier]!;
    p.cleared = ['goblin_keep', 'old_crypt', ...TIERS.slice(0, tier).map((x) => `${x.id}_boss`)];
    const city = W.sites[`${t.id}_city`]!;
    p.pos = { col: city.col, row: city.row };
    p.lastCity = city.id;
    p.visited = [W.startCity, city.id];
    p.activity = { kind: 'start' };
    p.nextAt = 0;
    return p;
  }

  it.each([0, 2, 4])(
    'a party hunts in region %i at its level and gains experience',
    (tier) => {
      const t = TIERS[tier]!;
      const level = t.minLevel + 3;
      const r = advance(partyIn(tier, level), 12 * 3600_000, W, cfg);
      const fights = r.events.filter((e) => e.kind === 'fight');
      expect(fights.length).toBeGreaterThan(5);
      expect(
        fights.some((e) => String((e.payload as { title: string }).title).startsWith(t.name)),
      ).toBe(true);
      expect(r.party.xp + r.party.level * 1e6).toBeGreaterThan(level * 1e6);
    },
    60_000,
  );

  it('a party can walk into the region dungeon and fight its stages', () => {
    const t = TIERS[0]!;
    const p = partyIn(0, t.minLevel + 8);
    p.orders.push({ id: 'o1', kind: 'goto', siteId: `${t.id}_dungeon` });
    const r = advance(p, 24 * 3600_000, W, cfg);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('enter_dungeon');
    const titles = r.events
      .filter((e) => e.kind === 'fight')
      .map((e) => String((e.payload as { title: string }).title));
    expect(titles.some((x) => x.startsWith(t.dungeon))).toBe(true);
  }, 60_000);
});
