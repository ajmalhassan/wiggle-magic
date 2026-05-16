// src/lib/actions/prompt-builder.ts
import type { PromptTemplate, PageMeta } from '../types/action';
import type { PickRef } from '../types/thread';

export const ALLOWED_PLACEHOLDERS = ['selections', 'question', 'title', 'url', 'lang'] as const;
export type Placeholder = (typeof ALLOWED_PLACEHOLDERS)[number];

export interface PromptInputs {
  picks: PickRef[];
  question: string | undefined;
  pageMeta: PageMeta;
  modifiers: string[];
  url?: string;                     // optional; falls back to empty string if absent
  modifierAddenda?: Record<string, string>;
}

export interface BuiltPrompt {
  system?: string;
  user: string;
}

function formatPicks(picks: PickRef[]): string {
  if (picks.length === 0) return '(no selections)';
  return picks
    .map((p, i) => {
      const head = `Selection ${i + 1} (${p.type}${p.tags.length ? ', ' + p.tags.join(', ') : ''}):`;
      if (p.payload.image) {
        return `${head}\n[image: ${p.payload.image.alt || p.payload.image.src}]`;
      }
      if (p.payload.link) {
        return `${head}\n[link: ${p.payload.link.text || p.payload.link.href}]`;
      }
      return `${head}\n${p.payload.text}`;
    })
    .join('\n\n');
}

function interpolate(tpl: string, values: Record<Placeholder, string>): string {
  let out = tpl;
  for (const k of ALLOWED_PLACEHOLDERS) {
    out = out.split(`{{${k}}}`).join(values[k]);
  }
  return out;
}

export function buildPrompt(template: PromptTemplate, inputs: PromptInputs): BuiltPrompt {
  const values: Record<Placeholder, string> = {
    selections: formatPicks(inputs.picks),
    question: inputs.question ?? '',
    title: inputs.pageMeta.title,
    url: inputs.url ?? '',
    lang: inputs.pageMeta.primaryLang,
  };

  let user = interpolate(template.user, values);

  const addenda = inputs.modifierAddenda ?? {};
  const applied = inputs.modifiers.map(m => addenda[m]).filter(Boolean);
  if (applied.length > 0) {
    user = `${user}\n\n${applied.join('\n\n')}`;
  }

  const built: BuiltPrompt = { user };
  if (template.system !== undefined) built.system = template.system;
  return built;
}
