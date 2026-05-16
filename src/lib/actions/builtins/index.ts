// src/lib/actions/builtins/index.ts
import { SUMMARIZE } from './summarize';
import { COMPARE } from './compare';
import { ASK } from './ask';
import { BUILTIN_MODIFIERS } from './modifiers';
import type { ActionDef, ModifierDef } from '../../types/action';

export const BUILTIN_CORE_ACTIONS: ActionDef[] = [SUMMARIZE, COMPARE, ASK];
export { BUILTIN_MODIFIERS };
export const BUILTIN_CORE_IDS = new Set(BUILTIN_CORE_ACTIONS.map(a => a.id));
