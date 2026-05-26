import type { TimeframeConfig } from '../types-shared';

export const timeframes: TimeframeConfig[] = [
  {
    value: 'daily',
    label: 'Daily Briefing',
    days: 1
  },
  {
    value: 'weekly',
    label: 'Weekly Review',
    days: 7
  },
  {
    value: 'monthly',
    label: 'Monthly Roundup',
    days: 30
  }
];
