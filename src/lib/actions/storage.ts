// src/lib/actions/storage.ts
import type { KVStore } from '../storage';
import type { ActionDef } from '../types/action';

const KEY_USER = 'wm:actions:user';
const KEY_HERO = 'wm:actions:hero';
const KEY_HIDDEN = 'wm:actions:hidden';
const KEY_ENABLED_LIBRARY = 'wm:actions:enabled-library';

export interface ActionsStorage {
  loadUserActions(): Promise<ActionDef[]>;
  saveUserActions(actions: ActionDef[]): Promise<void>;
  loadHeroOrder(): Promise<string[]>;
  saveHeroOrder(ids: string[]): Promise<void>;
  loadHidden(): Promise<string[]>;
  saveHidden(ids: string[]): Promise<void>;
  loadEnabledLibrary(): Promise<string[]>;
  saveEnabledLibrary(ids: string[]): Promise<void>;
}

export function createActionsStorage(kv: KVStore): ActionsStorage {
  return {
    async loadUserActions() {
      return (await kv.get<ActionDef[]>(KEY_USER)) ?? [];
    },
    async saveUserActions(actions) {
      await kv.set(KEY_USER, actions);
    },
    async loadHeroOrder() {
      return (await kv.get<string[]>(KEY_HERO)) ?? [];
    },
    async saveHeroOrder(ids) {
      await kv.set(KEY_HERO, ids);
    },
    async loadHidden() {
      return (await kv.get<string[]>(KEY_HIDDEN)) ?? [];
    },
    async saveHidden(ids) {
      await kv.set(KEY_HIDDEN, ids);
    },
    async loadEnabledLibrary() {
      return (await kv.get<string[]>(KEY_ENABLED_LIBRARY)) ?? [];
    },
    async saveEnabledLibrary(ids) {
      await kv.set(KEY_ENABLED_LIBRARY, ids);
    },
  };
}
