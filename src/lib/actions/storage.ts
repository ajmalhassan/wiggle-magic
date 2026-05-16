// src/lib/actions/storage.ts
import type { KVStore } from '../storage';
import type { ActionDef } from '../types/action';
import { KEYS } from '../storage-keys';

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
      return (await kv.get<ActionDef[]>(KEYS.actionsUser)) ?? [];
    },
    async saveUserActions(actions) {
      await kv.set(KEYS.actionsUser, actions);
    },
    async loadHeroOrder() {
      return (await kv.get<string[]>(KEYS.actionsHero)) ?? [];
    },
    async saveHeroOrder(ids) {
      await kv.set(KEYS.actionsHero, ids);
    },
    async loadHidden() {
      return (await kv.get<string[]>(KEYS.actionsHidden)) ?? [];
    },
    async saveHidden(ids) {
      await kv.set(KEYS.actionsHidden, ids);
    },
    async loadEnabledLibrary() {
      return (await kv.get<string[]>(KEYS.actionsEnabledLibrary)) ?? [];
    },
    async saveEnabledLibrary(ids) {
      await kv.set(KEYS.actionsEnabledLibrary, ids);
    },
  };
}
