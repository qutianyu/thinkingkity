export interface AiSkillIndexItem {
  name: string;
  description: string;
  path: string;
  allowedTools: string[];
  priority: number;
}

export interface AiSkill {
  index: AiSkillIndexItem;
  body: string;
  truncated: boolean;
}

