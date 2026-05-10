// Closing Workflow Logic - PMBOK Phase 5: Project Closing

export interface ClosingChecklist {
  id: string;
  category: 'acceptance' | 'documentation' | 'lessons' | 'finance' | 'contract';
  item: string;
  owner: string;
  dueDate: string;
  completed: boolean;
  evidence?: string; // proof of completion
}

export interface SignOff {
  role: string;
  name: string;
  signed: boolean;
  signedAt?: string;
  comments?: string;
}

export interface LessonLearned {
  id: string;
  projectId: string;
  projectName: string;
  category: string;
  issue: string;
  resolution: string;
  impact: 'high' | 'medium' | 'low';
  createdAt: string;
}

export interface ProjectClosing {
  projectId: string;
  projectName: string;
  checklists: ClosingChecklist[];
  signOffs: SignOff[];
  status: 'in-progress' | 'pending-approval' | 'completed' | 'archived';
}

/**
 * Calculate closing progress percentage
 */
export function calculateClosingProgress(checklist: ClosingChecklist[]): number {
  if (!checklist || checklist.length === 0) return 0;
  const completed = checklist.filter(item => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
}

/**
 * Get pending sign-offs from a project closing
 */
export function getPendingSignoffs(closing: ProjectClosing): SignOff[] {
  return closing.signOffs.filter(s => !s.signed);
}

/**
 * Search lessons learned across past projects
 */
export function searchLessons(projects: ProjectClosing[], query: string): LessonLearned[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: LessonLearned[] = [];

  // Mock lessons database for search
  const lessonsDb: LessonLearned[] = [
    {
      id: 'lesson-001',
      projectId: 'P-2024-001',
      projectName: '某市智慧教育平台',
      category: '需求管理',
      issue: '需求调研阶段用户访谈不足，导致后期需求变更频繁',
      resolution: '建立用户访谈清单模板，增加原型确认环节',
      impact: 'high',
      createdAt: '2024-08-15',
    },
    {
      id: 'lesson-002',
      projectId: 'P-2024-002',
      projectName: '高校数据中台项目',
      category: '测试管理',
      issue: '测试环境与生产环境存在差异，导致上线后出现兼容性问题',
      resolution: '引入容器化测试环境，建立环境一致性检查清单',
      impact: 'high',
      createdAt: '2024-09-20',
    },
    {
      id: 'lesson-003',
      projectId: 'P-2024-003',
      projectName: '职业教育基地建设',
      category: '风险管理',
      issue: '供应商交付延期风险未及时识别和应对',
      resolution: '建立供应商交付能力评估模型，设置预警机制',
      impact: 'medium',
      createdAt: '2024-10-05',
    },
    {
      id: 'lesson-004',
      projectId: 'P-2024-005',
      projectName: '智能化校园改造',
      category: '沟通协作',
      issue: '每日站会形式化，问题升级通道不畅通',
      resolution: '优化站会流程，引入问题跟踪工具，建立升级机制',
      impact: 'medium',
      createdAt: '2024-11-12',
    },
    {
      id: 'lesson-005',
      projectId: 'P-2023-008',
      projectName: '智慧课堂一期',
      category: '质量管理',
      issue: '验收标准定义不清，导致验收阶段反复',
      resolution: '在项目启动阶段与客户共同确定验收标准，并签字确认',
      impact: 'high',
      createdAt: '2023-12-01',
    },
    {
      id: 'lesson-006',
      projectId: 'P-2023-010',
      projectName: '教育局数据平台',
      category: '文档管理',
      issue: '项目文档归档不及时，项目知识流失',
      resolution: '建立文档归档检查点，纳入项目例行检查',
      impact: 'low',
      createdAt: '2023-10-18',
    },
    {
      id: 'lesson-007',
      projectId: 'P-2024-007',
      projectName: '高职虚拟仿真项目',
      category: '财务管理',
      issue: '成本超支未及时发现，预算执行偏差大',
      resolution: '引入月度成本 review 机制，建立成本预警线',
      impact: 'high',
      createdAt: '2024-06-25',
    },
    {
      id: 'lesson-008',
      projectId: 'P-2024-011',
      projectName: '智慧校园二期',
      category: '合同管理',
      issue: '合同付款节点与项目实际进度不匹配',
      resolution: '在合同签订前与财务团队对齐付款计划，建立弹性条款',
      impact: 'medium',
      createdAt: '2024-07-30',
    },
  ];

  for (const lesson of lessonsDb) {
    if (
      lesson.issue.toLowerCase().includes(lowerQuery) ||
      lesson.resolution.toLowerCase().includes(lowerQuery) ||
      lesson.category.toLowerCase().includes(lowerQuery) ||
      lesson.projectName.toLowerCase().includes(lowerQuery)
    ) {
      results.push(lesson);
    }
  }

  return results;
}

/**
 * Get all checklists grouped by category
 */
export function getChecklistsByCategory(checklists: ClosingChecklist[]): Record<string, ClosingChecklist[]> {
  return checklists.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ClosingChecklist[]>);
}

/**
 * Get category display name in Chinese
 */
export function getCategoryName(category: ClosingChecklist['category']): string {
  const names: Record<ClosingChecklist['category'], string> = {
    acceptance: '验收确认',
    documentation: '文档归档',
    lessons: '经验总结',
    finance: '财务结算',
    contract: '合同关闭',
  };
  return names[category] || category;
}

/**
 * Calculate overall closing score across all categories
 */
export function calculateOverallProgress(checklists: ClosingChecklist[]): number {
  const byCategory = getChecklistsByCategory(checklists);
  const categoryScores = Object.values(byCategory).map(group => calculateClosingProgress(group));
  if (categoryScores.length === 0) return 0;
  const total = categoryScores.reduce((sum, score) => sum + score, 0);
  return Math.round(total / categoryScores.length);
}
