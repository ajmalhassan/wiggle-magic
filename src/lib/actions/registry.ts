// src/lib/actions/registry.ts
import type { ActionDef, ActionContext, ModifierDef, ValidateResult } from '../types/action';
import type { KVStore } from '../storage';
import { BUILTIN_CORE_ACTIONS, BUILTIN_MODIFIERS, BUILTIN_CORE_IDS } from './builtins/index';
import { LIBRARY_ACTIONS, LIBRARY_IDS } from './library';
import { createActionsStorage } from './storage';
import { isAvailable } from './availability';
import { rankHeroes, tagScore } from './ranker';
import { validateAction } from './validate';

export interface ActionRegistry {
  // Read
  getAll(): ActionDef[];
  getById(id: string): ActionDef | null;
  getVisibleHeroes(ctx: ActionContext): ActionDef[];
  getSlashOptions(ctx: ActionContext): ActionDef[];
  getModifiers(): ModifierDef[];
  getLibrary(): ActionDef[];
  rankForContext(ctx: ActionContext, candidates: ActionDef[]): ActionDef[];
  // Mutate
  enableFromLibrary(id: string): Promise<ValidateResult>;
  disableFromLibrary(id: string): Promise<void>;
  registerUser(def: ActionDef): Promise<ValidateResult>;
  unregister(id: string): Promise<ValidateResult>;
  setHeroOrder(ids: string[]): Promise<void>;
  setHidden(ids: string[]): Promise<void>;
}

const DEFAULT_HERO_ORDER = ['summarize', 'compare'];

export async function createRegistry(kv: KVStore): Promise<ActionRegistry> {
  const storage = createActionsStorage(kv);

  let userActions: ActionDef[] = await storage.loadUserActions();
  let heroOrder: string[] = await storage.loadHeroOrder();
  let hidden: Set<string> = new Set(await storage.loadHidden());
  let enabledLibrary: Set<string> = new Set(await storage.loadEnabledLibrary());

  // First-run seed.
  if (heroOrder.length === 0) {
    heroOrder = [...DEFAULT_HERO_ORDER];
    await storage.saveHeroOrder(heroOrder);
  }

  function compose(): ActionDef[] {
    const all: ActionDef[] = [];
    for (const a of BUILTIN_CORE_ACTIONS) all.push(a);
    for (const a of LIBRARY_ACTIONS) if (enabledLibrary.has(a.id)) all.push(a);
    for (const a of userActions) all.push(a);
    return all.filter(a => !hidden.has(a.id));
  }

  return {
    getAll() { return compose(); },

    getById(id) {
      return compose().find(a => a.id === id) ?? null;
    },

    getVisibleHeroes(ctx) {
      const { visible } = rankHeroes(compose(), heroOrder, ctx);
      return visible;
    },

    getSlashOptions(ctx) {
      return compose()
        .filter(a => a.surface.includes('slash'))
        .filter(a => isAvailable(a.availableWhen, ctx));
    },

    getModifiers() { return BUILTIN_MODIFIERS; },

    getLibrary() { return LIBRARY_ACTIONS; },

    rankForContext(ctx, candidates) {
      return [...candidates].sort((a, b) => {
        const diff = tagScore(b, ctx) - tagScore(a, ctx);
        if (diff !== 0) return diff;
        return a.label.localeCompare(b.label);
      });
    },

    async enableFromLibrary(id) {
      if (!LIBRARY_IDS.has(id)) {
        return { ok: false, errors: [{ field: 'id', message: `unknown library id: ${id}` }] };
      }
      enabledLibrary.add(id);
      await storage.saveEnabledLibrary([...enabledLibrary]);
      return { ok: true };
    },

    async disableFromLibrary(id) {
      enabledLibrary.delete(id);
      await storage.saveEnabledLibrary([...enabledLibrary]);
    },

    async registerUser(def) {
      const result = validateAction(def);
      if (!result.ok) return result;
      if (BUILTIN_CORE_IDS.has(def.id) || LIBRARY_IDS.has(def.id)) {
        return { ok: false, errors: [{ field: 'id', message: `id collides with a built-in: ${def.id}` }] };
      }
      const existingIdx = userActions.findIndex(a => a.id === def.id);
      if (existingIdx >= 0) userActions[existingIdx] = def;
      else userActions.push(def);
      await storage.saveUserActions(userActions);
      return { ok: true };
    },

    async unregister(id) {
      if (BUILTIN_CORE_IDS.has(id)) {
        return { ok: false, errors: [{ field: 'id', message: 'cannot unregister built-in core' }] };
      }
      userActions = userActions.filter(a => a.id !== id);
      enabledLibrary.delete(id);
      await storage.saveUserActions(userActions);
      await storage.saveEnabledLibrary([...enabledLibrary]);
      return { ok: true };
    },

    async setHeroOrder(ids) {
      heroOrder = [...ids];
      await storage.saveHeroOrder(heroOrder);
    },

    async setHidden(ids) {
      hidden = new Set(ids);
      await storage.saveHidden([...hidden]);
    },
  };
}
