import type { BiasPosition, BiasConfig } from '../types-shared';

export const biasOptions: BiasConfig[] = [
  { id: 'extreme-left', label: 'Extreme Left Wing', shortLabel: 'EL' },
  { id: 'moderate-left', label: 'Moderate Left Wing', shortLabel: 'ML' },
  { id: 'moderate', label: 'Moderate', shortLabel: 'M' },
  { id: 'moderate-right', label: 'Moderate Right Wing', shortLabel: 'MR' },
  { id: 'extreme-right', label: 'Extreme Right Wing', shortLabel: 'ER' }
];

export const biasAgent1Instructions: Record<BiasPosition, string> = {
  'extreme-left': `- Headlines: Emphasize systemic failures, power imbalances, corporate greed
- Story order: Lead with inequality, labor, environment, social justice stories
- Language: "corporate exploitation," "workers struggle," "government inaction"
- Quotes: Prioritize voices from marginalized communities, labor unions, activists`,
  'moderate-left': `- Headlines: Balance progress with ongoing challenges
- Story order: Lead with policy impact on ordinary people, working families
- Language: "despite growth, challenges remain," "advocates call for action"
- Quotes: Progressive voices, policy experts, community organizers`,
  'moderate': `- Headlines: Neutral, factual presentation
- Story order: Most newsworthy regardless of political angle
- Language: "according to reports," "officials stated," "data shows"
- Quotes: Balance multiple perspectives equally`,
  'moderate-right': `- Headlines: Emphasize economic success, individual achievement, market solutions
- Story order: Lead with business, markets, deregulation, fiscal responsibility
- Language: "pro-business policies," "economic freedom," "market-driven solutions"
- Quotes: Business leaders, market analysts, entrepreneurs`,
  'extreme-right': `- Headlines: Emphasize threats, sovereignty, traditional values, national security
- Story order: Lead with security, immigration, cultural preservation
- Language: "national security threat," "protecting our values," "foreign interference"
- Quotes: Nationalist voices, security officials, traditional values advocates`
};

export const biasEditorialGuidelines: Record<BiasPosition, string> = {
  'extreme-left': `- Frame themes as systemic failures requiring structural change
- Emphasize collective action and solidarity
- Call for policy interventions, regulation, redistribution
- Example: "These stories reveal a pattern of corporate greed that demands systemic reform..."`,
  'moderate-left': `- Balance critique with pragmatic solutions
- Highlight progress possible through reform
- Emphasize policy over revolution
- Example: "While challenges persist, the path forward requires thoughtful policy intervention..."`,
  'moderate': `- Present multiple interpretive frameworks
- Acknowledge complexity without partisan framing
- Focus on civic engagement and informed citizenry
- Example: "These developments raise important questions about the balance between..."`,
  'moderate-right': `- Emphasize market solutions and individual responsibility
- Highlight government overreach concerns
- Focus on economic freedom and fiscal responsibility
- Example: "These trends demonstrate the importance of free-market principles..."`,
  'extreme-right': `- Frame as threats to national/cultural identity
- Emphasize sovereignty and traditional values
- Call for decisive protective action
- Example: "These events represent a clear danger to our way of life that requires immediate action..."`
};
