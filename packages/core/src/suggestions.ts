/** Kiểu dùng chung cho lớp gợi ý (rule-based / AI). Phase 5. */
import type { MamType, Region } from './domain.js';

export interface MenuSuggestion {
  occasionId: string;
  region: Region;
  mamType: MamType;
  guestCount: number;
  dishIds: string[];
  /** Lời giải thích vì sao gợi ý mâm này. */
  explanation: string;
  /** Nguồn gợi ý: luật offline hay AI. */
  provider: 'rule' | 'claude';
}
