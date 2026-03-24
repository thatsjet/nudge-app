// Types duplicated from shared/types.ts per tsconfig convention
export type NudgeType = 'morning' | 'midday' | 'endOfDay';

export interface NudgeConfig {
  enabled: boolean;
  time: string; // "HH:MM" 24-hour format
}

export interface NudgeSettings {
  morning: NudgeConfig;
  midday: NudgeConfig;
  endOfDay: NudgeConfig;
  doNotDisturb: boolean;
}

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  morning: { enabled: false, time: '08:00' },
  midday: { enabled: false, time: '11:00' },
  endOfDay: { enabled: false, time: '15:00' },
  doNotDisturb: false,
};

export const NUDGE_PROMPTS: Record<NudgeType, { title: string; sessionTitle: string; addendum: string }> = {
  morning: {
    title: 'Morning Nudge',
    sessionTitle: 'Morning Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is a morning nudge. Read the user's tasks and ideas from the vault, then suggest one small thing to start with. Keep it to 1-2 sentences. Be warm and low-pressure. No lists, no overwhelm.`,
  },
  midday: {
    title: 'Mid-day Nudge',
    sessionTitle: 'Mid-day Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is a mid-day nudge. Light check-in — suggest a quick win from their tasks or a movement/stretch break. 1-2 sentences max. Keep it casual.`,
  },
  endOfDay: {
    title: 'End of Day Nudge',
    sessionTitle: 'End of Day Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is an end-of-day nudge. Invite a quick reflection on the day. Don't summarize their day for them — just ask a simple question. 1-2 sentences, warm tone.`,
  },
};

const NUDGE_TYPES: NudgeType[] = ['morning', 'midday', 'endOfDay'];

export class NudgeScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private firedToday: Set<NudgeType> = new Set();
  private lastDateString: string = '';

  constructor(
    private getSettings: () => NudgeSettings,
    private saveSettings: (settings: NudgeSettings) => void,
    private onNudgeFire: (type: NudgeType) => void,
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.lastDateString = this.todayString();
    this.intervalId = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private todayString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private currentHHMM(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private tick(): void {
    const today = this.todayString();
    const currentTime = this.currentHHMM();

    // Day rollover — reset fired tracking
    if (today !== this.lastDateString) {
      this.firedToday.clear();
      this.lastDateString = today;
    }

    const settings = this.getSettings();

    // Auto-reset DnD at end-of-day time (or midnight if EOD disabled)
    if (settings.doNotDisturb) {
      const resetTime = settings.endOfDay.enabled ? settings.endOfDay.time : '00:00';
      if (currentTime === resetTime) {
        settings.doNotDisturb = false;
        this.saveSettings(settings);
      }
      return; // DnD active — skip all nudges
    }

    // Check each nudge type
    for (const type of NUDGE_TYPES) {
      const config = settings[type];
      if (config.enabled && !this.firedToday.has(type) && currentTime === config.time) {
        this.firedToday.add(type);
        this.onNudgeFire(type);
      }
    }
  }
}
