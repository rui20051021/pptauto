import { useEffect, useMemo, useRef, useState, type DragEvent, type FC, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Download,
  Gift,
  GripVertical,
  LayoutTemplate,
  Loader2,
  MessageSquare,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  RefreshCw,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  createProject,
  draftOutline,
  getDownloadInfo,
  getDownloadUrl,
  getTask,
  listTemplates,
  reviseOutline,
  startGeneration,
  uploadSource,
  uploadText,
  type DownloadResponse,
  type SlideOutline,
  type TaskResponse,
  type TemplateEntry,
  type TemplatesIndex,
} from './lib/api';

type Phase = 'idle' | 'drafting' | 'editing' | 'generating' | 'done';
type AppView = 'landing' | 'studio';

const LAYOUT_OPTIONS = ['cover', 'content', 'section', 'comparison', 'chart', 'summary'];

const PROMPT_SUGGESTIONS = [
  'Dify 产品介绍',
  '北京 5 日游攻略',
  '良信电器企业介绍',
  '汽车行业调研报告',
];

const SHOWCASE_ITEMS = [
  {
    title: '北京 5 日游攻略',
    subtitle: '生活常用',
    prompt: '帮我做一份北京 5 日游攻略 PPT，适合朋友出行参考，风格清爽、信息明确。',
    previewClass: 'from-[#fff7f2] via-[#fff1ea] to-[#fff9f7]',
    accent: '北京出行 / 攻略',
  },
  {
    title: '正泰电器企业介绍 PPT',
    subtitle: '企业介绍',
    prompt: '做一份面向客户沟通的企业介绍 PPT，突出公司实力、产品布局和关键案例。',
    previewClass: 'from-[#f2fff8] via-[#effcf6] to-[#f7fffb]',
    accent: '企业介绍 / 能源设备',
  },
  {
    title: 'Dify 产品介绍 PPT',
    subtitle: '产品介绍',
    prompt: '帮我做一份 Dify 产品介绍 PPT，给企业客户介绍能力边界、场景和价值。',
    previewClass: 'from-[#111827] via-[#16133a] to-[#1d1b52]',
    accent: 'AI 产品 / 深色科技',
  },
  {
    title: '小米 Q3 季度财报分析',
    subtitle: '根据 PDF 生成 PPT',
    prompt: '生成一份小米季度财报分析 PPT，面向管理层汇报，重点突出收入结构、利润和风险。',
    previewClass: 'from-[#fff8f3] via-[#fffdf9] to-[#fff5ee]',
    accent: '财报分析 / 管理层汇报',
  },
];

const LANDING_FEATURES = [
  {
    eyebrow: '输入方式',
    title: '一句话、附件、已有结构都能开始',
    description: '你可以直接描述主题，也可以上传 PDF / Word / Markdown，让系统先整理结构再进入制作。',
  },
  {
    eyebrow: '可编辑输出',
    title: '不是截图式导出，而是可继续修改的 PPTX',
    description: '生成完成后还能回到大纲继续调整，再次输出。整个流程更像一个真正的演示工作台。',
  },
  {
    eyebrow: '模板体系',
    title: '品牌、答辩、政企、咨询风格一键切换',
    description: '先选模板，再启动生成。封面、章节页、内容页和整体视觉语言会一起同步变化。',
  },
];

const LANDING_WORKFLOW = [
  {
    step: '01',
    title: '明确主题',
    description: '输入一句需求，或者拖入你的源文档。',
  },
  {
    step: '02',
    title: '选择风格',
    description: '像挑产品外观一样先挑模板，再确认整体气质。',
  },
  {
    step: '03',
    title: '编辑大纲',
    description: '先看结构、顺序和每页要点，再决定是否继续微调。',
  },
  {
    step: '04',
    title: '导出成稿',
    description: '生成完成后直接下载 PPTX，也可以继续打磨后重新生成。',
  },
];

const MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const PAGE_SHELL_VARIANTS = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.56, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    y: -14,
    transition: { duration: 0.34, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
  },
};

const SECTION_ENTER_VARIANTS = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: MOTION_EASE },
  },
};

const STAGGER_BLOCK_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const STAGGER_CARD_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
};

const ITEM_ENTER_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.62, ease: MOTION_EASE },
  },
};

const CARD_ENTER_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.58, ease: MOTION_EASE },
  },
};

const HERO_VISUAL_VARIANTS = {
  hidden: { opacity: 0, y: 28, scale: 0.96, rotateX: 8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: { duration: 0.84, ease: MOTION_EASE, delay: 0.14 },
  },
};

const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  all: '全部模板',
  brand: '品牌风格模板',
  general: '通用风格模板',
  scenario: '场景专用模板',
  government: '政企汇报模板',
  special: '特殊风格模板',
};

const TEMPLATE_COPY: Record<string, { label: string; summary: string }> = {
  academic_defense: {
    label: '学术答辩模板',
    summary: '适合论文答辩、课题汇报和项目开题，结构标准、学术感明确。',
  },
  ai_ops: {
    label: '政企数智化模板',
    summary: '适合 AI 运维架构、系统总览和数字化转型类高密度汇报。',
  },
  anthropic: {
    label: 'Anthropic 科技风模板',
    summary: '适合 AI / LLM 分享、产品发布和开发者技术介绍。',
  },
  exhibit: {
    label: 'Exhibit 战略模板',
    summary: '适合结论先行的战略报告、经营分析和高层管理汇报。',
  },
  google_style: {
    label: 'Google 品牌模板',
    summary: '适合年度总结、技术分享和企业品牌化表达。',
  },
  government_blue: {
    label: '政务蓝模板',
    summary: '适合智慧治理、数字政府和蓝色政务体系汇报。',
  },
  government_red: {
    label: '政务红模板',
    summary: '适合政府汇报、党建场景和正式庄重的主题表达。',
  },
  mckinsey: {
    label: '麦肯锡咨询模板',
    summary: '适合战略咨询、投资分析和结构化商业表达。',
  },
  medical_university: {
    label: '医院 / 医学院模板',
    summary: '适合医学报告、病例讨论、科研展示和院校汇报。',
  },
  pixel_retro: {
    label: '像素复古模板',
    summary: '适合游戏、科技分享和偏创意的像素风主题内容。',
  },
  psychology_attachment: {
    label: '心理疗愈模板',
    summary: '适合心理咨询培训、疗愈讲座和温和可信的表达场景。',
  },
  smart_red: {
    label: '橙红商业模板',
    summary: '适合科技企业介绍、教育方案和更有活力的商务汇报。',
  },
  中国电建_常规: {
    label: '中国电建标准模板',
    summary: '适合工程建设、能源项目和国企风格的稳健型汇报。',
  },
  中国电建_现代: {
    label: '中国电建现代模板',
    summary: '适合重大项目、国际业务和现代工程类演示。',
  },
  中汽研_商务: {
    label: '中汽研商务模板',
    summary: '适合认证成果展示、高端商务路演和专业品牌表达。',
  },
  中汽研_常规: {
    label: '中汽研标准模板',
    summary: '适合认证检测、测试说明和权威型专业汇报。',
  },
  中汽研_现代: {
    label: '中汽研未来科技模板',
    summary: '适合前沿科技展示、发布会和深色未来感主题。',
  },
  招商银行: {
    label: '招商银行交易银行模板',
    summary: '适合产品宣讲、销售收款方案和分行培训等金融场景。',
  },
  科技蓝商务: {
    label: '科技蓝商务模板',
    summary: '适合企业汇报、解决方案和偏科技感的商务表达。',
  },
  重庆大学: {
    label: '重庆大学答辩模板',
    summary: '适合高校答辩、研究展示和院校专属风格演示。',
  },
};

const RECENT_PROMPTS_STORAGE_KEY = 'ppt-master.recent-prompts';
const RECENT_PROMPT_WINDOW = 7 * 24 * 60 * 60 * 1000;
const MAX_RECENT_PROMPTS = 8;
const SOURCE_FILE_ACCEPT = '.pdf,.doc,.docx,.txt,.md,.pptx';

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return '待开始';
    case 'drafting':
      return '整理大纲';
    case 'editing':
      return '编辑大纲';
    case 'generating':
      return '生成中';
    case 'done':
      return '已完成';
  }
}

function phaseHeadline(phase: Phase, outlineCount: number): string {
  switch (phase) {
    case 'idle':
      return '下午好，\n有什么 PPT 需要我做？';
    case 'drafting':
      return outlineCount ? 'AI 正在更新这份大纲。' : 'AI 正在准备这份 PPT 的结构。';
    case 'editing':
      return '大纲已经准备好，可以继续编辑。';
    case 'generating':
      return '正在把大纲转换成最终演示文件。';
    case 'done':
      return '这一版 PPT 已经生成完成。';
  }
}

function phaseSubcopy(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return 'AI 生成定制级、可编辑的 PPT';
    case 'drafting':
      return '系统会先整理章节结构、页面类型和要点，再进入下一步。';
    case 'editing':
      return '你可以继续微调每一页的标题、描述、要点和顺序。';
    case 'generating':
      return '页面渲染、导出和下载文件准备正在连续执行。';
    case 'done':
      return '如果还想继续打磨结构，可以直接编辑后重新生成。';
  }
}

function taskSummary(task: TaskResponse | null): string {
  if (!task) return '等待开始';
  return task.stage || task.status || '等待开始';
}

function getLocalizedCategoryLabel(key: string, fallback: string): string {
  return TEMPLATE_CATEGORY_LABELS[key] ?? fallback;
}

function getLocalizedTemplateMeta(templateId: string, label: string, summary: string): { label: string; summary: string } {
  return TEMPLATE_COPY[templateId] ?? { label, summary };
}

function buildRecentPromptTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 24) return normalized;
  return `${normalized.slice(0, 24)}...`;
}

function resizeTextarea(element: HTMLTextAreaElement | null, minHeight: number): void {
  if (!element) return;
  element.style.height = '0px';
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
}

interface RecentPromptEntry {
  id: string;
  title: string;
  prompt: string;
  updatedAt: number;
}

interface EditableSlideProps {
  slide: SlideOutline;
  index: number;
  total: number;
  onChange: (patch: Partial<SlideOutline>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertAfter: () => void;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
}

const EditableSlideCard: FC<EditableSlideProps> = ({
  slide,
  index,
  total,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  onInsertAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) => {
  const [pointsText, setPointsText] = useState((slide.points ?? []).join('\n'));

  useEffect(() => {
    setPointsText((slide.points ?? []).join('\n'));
  }, [slide.points]);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="studio-card group overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] bg-black/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] text-black/44">
            <GripVertical className="h-3.5 w-3.5" />
            <span className="font-mono">#{String(index + 1).padStart(2, '0')}</span>
          </div>
          <select
            value={slide.layout || 'content'}
            onChange={(event) => onChange({ layout: event.target.value })}
            className="studio-select min-w-[124px] bg-white text-[12px] text-[#3b82f6]"
          >
            {LAYOUT_OPTIONS.map((layout) => (
              <option key={layout} value={layout}>
                {layout}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <IconButton title="上移" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="下移" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="复制" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="删除" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        <div className="space-y-2">
          <div className="studio-field-label">标题</div>
          <input
            value={slide.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="这一页要表达什么"
            className="studio-input bg-transparent px-0 text-[20px] font-semibold tracking-[-0.02em]"
          />
        </div>

        <div className="space-y-2">
          <div className="studio-field-label">描述</div>
          <textarea
            value={slide.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="补一句说明"
            rows={2}
            className="studio-textarea"
          />
        </div>

        <div className="space-y-2">
          <div className="studio-field-label">要点</div>
          <textarea
            value={pointsText}
            onChange={(event) => setPointsText(event.target.value)}
            onBlur={() =>
              onChange({
                points: pointsText
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
            placeholder="每行一个要点"
            rows={Math.max(4, pointsText.split('\n').length)}
            className="studio-textarea font-mono text-[13px] leading-[1.6] tracking-[-0.01em]"
          />
        </div>
      </div>

      <button type="button" onClick={onInsertAfter} className="studio-add-row">
        <Plus className="h-3.5 w-3.5" />
        在这页后新增一页
      </button>
    </article>
  );
};

const IconButton: FC<{
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}> = ({ children, onClick, title, disabled }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`studio-icon-button ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
    >
      {children}
    </button>
  );
};

const CategoryChip: FC<{
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}> = ({ children, active, onClick }) => {
  return (
    <button type="button" onClick={onClick} className={`studio-chip ${active ? 'studio-chip-active' : ''}`}>
      {children}
    </button>
  );
};

function App() {
  const [appView, setAppView] = useState<AppView>('landing');
  const [phase, setPhase] = useState<Phase>('idle');
  const [promptText, setPromptText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState(10);
  const [autoChart, setAutoChart] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 1024,
  );
  const [promptDropActive, setPromptDropActive] = useState(false);
  const [recentPrompts, setRecentPrompts] = useState<RecentPromptEntry[]>([]);

  const [templatesIndex, setTemplatesIndex] = useState<TemplatesIndex | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');

  const [projectId, setProjectId] = useState<string | null>(null);
  const [outline, setOutline] = useState<SlideOutline[]>([]);
  const [reviseInstruction, setReviseInstruction] = useState('');

  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dragIndexRef = useRef<number | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const reviseTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptDropDepthRef = useRef(0);
  const templateSectionRef = useRef<HTMLDivElement | null>(null);
  const editorTemplateRef = useRef<HTMLDivElement | null>(null);
  const landingFeaturesRef = useRef<HTMLDivElement | null>(null);
  const landingWorkflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('view') === 'studio') {
      setAppView('studio');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((index) => {
        if (!cancelled) setTemplatesIndex(index);
      })
      .catch((error) => console.warn('Failed to load templates index', error));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(RECENT_PROMPTS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const normalized = parsed
        .filter(
          (entry): entry is RecentPromptEntry =>
            typeof entry?.id === 'string' &&
            typeof entry?.title === 'string' &&
            typeof entry?.prompt === 'string' &&
            typeof entry?.updatedAt === 'number',
        )
        .slice(0, MAX_RECENT_PROMPTS);

      setRecentPrompts(normalized);
    } catch (error) {
      console.warn('Failed to restore recent prompts', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewport = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobileViewport(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);

    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    resizeTextarea(promptTextareaRef.current, 88);
  }, [promptText]);

  useEffect(() => {
    resizeTextarea(reviseTextareaRef.current, 104);
  }, [reviseInstruction]);

  useEffect(() => {
    if (!outline.length) return;
    setSlideCount(outline.length);
  }, [outline.length]);

  useEffect(() => {
    if (!mobileSidebarOpen || typeof window === 'undefined') return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const next = await getTask(taskId);
        if (cancelled) return;

        setTask(next);
        if (next.slides?.length) {
          setOutline([...next.slides].sort((a, b) => a.id - b.id));
        }

        if (next.status === 'completed') {
          setPhase('done');
          const info = await getDownloadInfo(next.project_id).catch(() => null);
          if (!cancelled && info) setDownloadInfo(info);
          if (timer) window.clearInterval(timer);
        }

        if (next.status === 'failed') {
          setPhase('editing');
          setErrorMessage(next.error || '生成失败，请查看后端日志。');
          if (timer) window.clearInterval(timer);
        }
      } catch (error) {
        if (cancelled) return;
        setPhase('editing');
        setErrorMessage(error instanceof Error ? error.message : '获取任务状态失败');
        if (timer) window.clearInterval(timer);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [taskId]);

  const templateEntries = useMemo(() => {
    if (!templatesIndex) return [] as TemplateEntry[];
    const allEntries: TemplateEntry[] = Object.entries(templatesIndex.layouts).map(([id, value]) => ({
      ...(value as TemplateEntry),
      id,
    }));
    if (activeCategory === 'all') return allEntries;
    const ids = templatesIndex.categories[activeCategory]?.layouts ?? [];
    const idSet = new Set(ids);
    return allEntries.filter((entry) => idSet.has(entry.id));
  }, [templatesIndex, activeCategory]);

  const templateCategoryEntries = useMemo(
    () =>
      templatesIndex
        ? (Object.entries(templatesIndex.categories) as [string, { label: string; layouts: string[] }][])
        : [],
    [templatesIndex],
  );
  const landingTemplateEntries = useMemo(
    () =>
      templatesIndex
        ? (Object.entries(templatesIndex.layouts) as [string, TemplateEntry][])
            .slice(0, 8)
            .map(([id, template]) => ({
              ...template,
              id,
            }))
        : [],
    [templatesIndex],
  );
  const selectedTemplate = selectedTemplateId ? templatesIndex?.layouts[selectedTemplateId] : null;
  const selectedTemplateMeta = selectedTemplateId && selectedTemplate
    ? getLocalizedTemplateMeta(selectedTemplateId, selectedTemplate.label, selectedTemplate.summary)
    : null;
  const progressValue = task?.progress ?? 0;
  const totalPoints = outline.reduce((sum, slide) => sum + (slide.points?.length ?? 0), 0);
  const hasPromptInput = Boolean(promptText.trim() || attachedFile);

  const fallbackRecentPrompts = useMemo<RecentPromptEntry[]>(
    () =>
      promptText.trim()
        ? [
            {
              id: 'current-draft',
              title: buildRecentPromptTitle(promptText),
              prompt: promptText,
              updatedAt: Date.now(),
            },
          ]
        : [],
    [promptText],
  );

  const visibleRecentPrompts = recentPrompts.length ? recentPrompts : fallbackRecentPrompts;
  const recentThisWeek = useMemo(
    () => visibleRecentPrompts.filter((entry) => Date.now() - entry.updatedAt <= RECENT_PROMPT_WINDOW).slice(0, 4),
    [visibleRecentPrompts],
  );
  const recentEarlier = useMemo(
    () => visibleRecentPrompts.filter((entry) => Date.now() - entry.updatedAt > RECENT_PROMPT_WINDOW).slice(0, 4),
    [visibleRecentPrompts],
  );

  const clearGenerationState = (nextPhase: Phase = 'editing') => {
    setPhase(nextPhase);
    setTask(null);
    setTaskId(null);
    setDownloadInfo(null);
  };

  const markOutlineDirty = () => {
    if (phase === 'done' || phase === 'generating') {
      clearGenerationState('editing');
      return;
    }
    setTask(null);
    setTaskId(null);
    setDownloadInfo(null);
  };

  const handleResetWorkspace = () => {
    setPhase('idle');
    setPromptText('');
    setAttachedFile(null);
    setSlideCount(10);
    setAutoChart(true);
    setAdvancedOpen(false);
    setTemplatePickerOpen(false);
    setSelectedTemplateId(null);
    setActiveCategory('all');
    setProjectId(null);
    setOutline([]);
    setReviseInstruction('');
    setTaskId(null);
    setTask(null);
    setDownloadInfo(null);
    setErrorMessage(null);
    dragIndexRef.current = null;
    promptDropDepthRef.current = 0;
    setPromptDropActive(false);
    if (isMobileViewport) setMobileSidebarOpen(false);
  };

  const rememberPrompt = (value: string) => {
    const prompt = value.replace(/\s+/g, ' ').trim();
    if (!prompt || typeof window === 'undefined') return;

    setRecentPrompts((current) => {
      const nextEntry: RecentPromptEntry = {
        id: `prompt-${Date.now()}`,
        title: buildRecentPromptTitle(prompt),
        prompt,
        updatedAt: Date.now(),
      };

      const next = [nextEntry, ...current.filter((entry) => entry.prompt !== prompt)].slice(0, MAX_RECENT_PROMPTS);
      window.localStorage.setItem(RECENT_PROMPTS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSelectRecentPrompt = (entry: RecentPromptEntry) => {
    handleResetWorkspace();
    setPromptText(entry.prompt);
    setErrorMessage(null);
    window.setTimeout(() => promptTextareaRef.current?.focus(), 60);
  };

  const handleAttachFile = (file: File | null) => {
    setAttachedFile(file);
    setErrorMessage(null);
  };

  const handleRemoveAttachedFile = () => {
    setAttachedFile(null);
  };

  const handlePromptComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleDraftOutline();
    }
  };

  const handleReviseComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleReviseOutline();
    }
  };

  const handleTemplateSelection = (templateId: string | null) => {
    if (selectedTemplateId !== templateId && outline.length) {
      markOutlineDirty();
    }

    setSelectedTemplateId(templateId);
    setTemplatePickerOpen(false);
  };

  const ensureProjectReady = async (desiredSlideCount: number) => {
    if (projectId) return projectId;

    const project = await createProject({
      name: 'web_presentation',
      format: 'ppt169',
      slideCount: desiredSlideCount,
    });

    const pid = project.project_id;
    setProjectId(pid);

    if (attachedFile) {
      await uploadSource(pid, attachedFile);
    } else if (promptText.trim()) {
      await uploadText(pid, promptText.trim());
    }

    return pid;
  };

  const scrollToTemplateSection = () => {
    const target = phase === 'idle' ? templateSectionRef.current : editorTemplateRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToLandingSection = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openStudio = () => {
    setAppView('studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => promptTextareaRef.current?.focus(), 120);
  };

  const openLanding = () => {
    setAppView('landing');
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const focusPromptComposer = () => {
    if (phase !== 'idle') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.setTimeout(() => promptTextareaRef.current?.focus(), 60);
  };

  const focusRevisionComposer = () => {
    if (phase === 'idle') {
      focusPromptComposer();
      return;
    }

    reviseTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => reviseTextareaRef.current?.focus(), 60);
  };

  const toggleTemplatePicker = () => {
    if (phase === 'idle') {
      scrollToTemplateSection();
      return;
    }

    setTemplatePickerOpen((open) => !open);
    window.setTimeout(() => editorTemplateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  };

  const handlePromptDropEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    promptDropDepthRef.current += 1;
    setPromptDropActive(true);
  };

  const handlePromptDropLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    promptDropDepthRef.current = Math.max(0, promptDropDepthRef.current - 1);
    if (promptDropDepthRef.current === 0) setPromptDropActive(false);
  };

  const handlePromptDropOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handlePromptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    promptDropDepthRef.current = 0;
    setPromptDropActive(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) handleAttachFile(nextFile);
  };

  const handleDraftOutline = async () => {
    if (phase === 'drafting') return;
    if (!promptText.trim() && !attachedFile) {
      setErrorMessage('先写一句需求，或者上传一份源文档。');
      return;
    }

    setErrorMessage(null);
    setPhase('drafting');
    setMobileSidebarOpen(false);

    try {
      const pid = await ensureProjectReady(slideCount);

      const response = await draftOutline({
        projectId: pid,
        requirements: promptText,
        slideCount,
        autoChart,
        templateId: selectedTemplateId,
      });

      setOutline(response.slides.sort((a, b) => a.id - b.id));
      rememberPrompt(promptText);
      setPhase('editing');
    } catch (error) {
      setPhase('idle');
      setErrorMessage(error instanceof Error ? error.message : '生成大纲失败');
    }
  };

  const handleReviseOutline = async () => {
    if (!outline.length || phase === 'drafting' || phase === 'generating') return;
    if (!reviseInstruction.trim()) {
      setErrorMessage('告诉 AI 你希望怎么修改当前大纲。');
      return;
    }

    setErrorMessage(null);
    setPhase('drafting');

    try {
      const pid = await ensureProjectReady(outline.length || slideCount);
      const response = await reviseOutline({
        projectId: pid,
        outline,
        instruction: reviseInstruction,
        autoChart,
        templateId: selectedTemplateId,
      });

      setOutline(response.slides.sort((a, b) => a.id - b.id));
      setReviseInstruction('');
      setTask(null);
      setTaskId(null);
      setDownloadInfo(null);
      setPhase('editing');
    } catch (error) {
      setPhase('editing');
      setErrorMessage(error instanceof Error ? error.message : '修改大纲失败');
    }
  };

  const handleStartGeneration = async () => {
    if (!outline.length) return;
    setErrorMessage(null);
    setDownloadInfo(null);
    setPhase('generating');

    try {
      const pid = await ensureProjectReady(outline.length);
      const generation = await startGeneration({
        projectId: pid,
        slideCount: outline.length,
        autoChart,
        templateId: selectedTemplateId,
        outline,
      });
      setTaskId(generation.task_id);
    } catch (error) {
      setPhase('editing');
      setErrorMessage(error instanceof Error ? error.message : '启动生成失败');
    }
  };

  const handleDownload = () => {
    if (!downloadInfo) return;
    const link = document.createElement('a');
    link.href = getDownloadUrl(downloadInfo.url);
    link.download = downloadInfo.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const patchSlide = (index: number, patch: Partial<SlideOutline>) => {
    markOutlineDirty();
    setOutline((current) => current.map((slide, slideIndex) => (slideIndex === index ? { ...slide, ...patch } : slide)));
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= outline.length) return;
    markOutlineDirty();
    setOutline((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((slide, slideIndex) => ({ ...slide, id: slideIndex + 1 }));
    });
  };

  const deleteSlide = (index: number) => {
    markOutlineDirty();
    setOutline((current) =>
      current.filter((_, slideIndex) => slideIndex !== index).map((slide, slideIndex) => ({ ...slide, id: slideIndex + 1 })),
    );
  };

  const duplicateSlide = (index: number) => {
    markOutlineDirty();
    setOutline((current) => {
      const copy = { ...current[index] };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next.map((slide, slideIndex) => ({ ...slide, id: slideIndex + 1 }));
    });
  };

  const insertAfter = (index: number) => {
    markOutlineDirty();
    setOutline((current) => {
      const blank: SlideOutline = {
        id: index + 2,
        title: '新的一页',
        description: '',
        layout: 'content',
        points: [],
      };
      const next = [...current];
      next.splice(index + 1, 0, blank);
      return next.map((slide, slideIndex) => ({ ...slide, id: slideIndex + 1 }));
    });
  };

  const selectPromptSuggestion = (value: string) => {
    setPromptText(value);
    setErrorMessage(null);
    window.setTimeout(() => promptTextareaRef.current?.focus(), 40);
  };

  const applyShowcasePrompt = (value: string) => {
    setPromptText(value);
    setErrorMessage(null);
    setAdvancedOpen(false);
    setTemplatePickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => promptTextareaRef.current?.focus(), 80);
  };

  const compactSidebar = !isMobileViewport && sidebarCollapsed;
  const templatePickerBody = (
    <div className="mt-4 space-y-4">
      {templatesIndex ? (
        <>
          <div className="flex flex-wrap gap-2">
            <CategoryChip active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
              {getLocalizedCategoryLabel('all', '全部')}
            </CategoryChip>
            {templateCategoryEntries.map(([key, category]) => (
              <CategoryChip key={key} active={activeCategory === key} onClick={() => setActiveCategory(key)}>
                {getLocalizedCategoryLabel(key, category.label)}
              </CategoryChip>
            ))}
          </div>

          <div className="grid max-h-[320px] grid-cols-1 gap-3 overflow-y-auto pr-1 no-scrollbar md:grid-cols-2">
            <button
              type="button"
              onClick={() => handleTemplateSelection(null)}
              className={`rounded-[18px] border px-4 py-4 text-left transition-colors ${
                selectedTemplateId === null
                  ? 'border-[#2f6fed] bg-white shadow-[0_8px_24px_rgba(47,111,237,0.12)]'
                  : 'border-black/[0.08] bg-white hover:border-black/16'
              }`}
            >
              <div className="text-[13px] font-medium text-[#1d1d1f]">自由设计</div>
              <div className="mt-1 text-[12px] text-black/48">按主题自由排版，不绑定固定模板。</div>
            </button>

            {templateEntries.length > 0 ? (
              templateEntries.map((template) => {
                const selected = selectedTemplateId === template.id;
                const localized = getLocalizedTemplateMeta(template.id, template.label, template.summary);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelection(selected ? null : template.id)}
                    className={`overflow-hidden rounded-[18px] border text-left transition-colors ${
                      selected
                        ? 'border-[#2f6fed] bg-white shadow-[0_8px_24px_rgba(47,111,237,0.12)]'
                        : 'border-black/[0.08] bg-white hover:border-black/16'
                    }`}
                  >
                    <div className="aspect-[16/9] bg-[#ececef]">
                      {template.thumbnail ? (
                        <img src={template.thumbnail} alt={localized.label} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <LayoutTemplate className="h-5 w-5 text-black/20" />
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-medium text-[#1d1d1f]">{localized.label}</div>
                        {selected && <Check className="h-4 w-4 text-[#2f6fed]" />}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-[1.55] text-black/48">{localized.summary}</div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-black/[0.08] bg-[#fafafa] px-4 py-6 text-[12px] text-black/48">
                当前分类还没有模板，试试切换到其他分类。
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-black/48">
          <Loader2 className="h-4 w-4 animate-spin text-[#2f6fed]" />
          正在加载模板...
        </div>
      )}
    </div>
  );
  const idleTemplateExplorer = (
    <motion.section
      ref={templateSectionRef}
      className="mt-10 w-full max-w-[1480px]"
      variants={SECTION_ENTER_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.16 }}
    >
      <div className="rounded-[32px] border border-black/[0.06] bg-white px-5 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] md:px-7 md:py-7">
        <motion.div
          className="flex flex-col gap-5 border-b border-black/[0.06] pb-5 xl:flex-row xl:items-end xl:justify-between"
          variants={STAGGER_BLOCK_VARIANTS}
        >
          <motion.div variants={ITEM_ENTER_VARIANTS}>
            <div className="text-[12px] font-medium tracking-[0.08em] text-black/34">模板选择</div>
            <h3 className="mt-2 font-display text-[28px] font-semibold leading-[1.14] tracking-[-0.03em] text-[#1d1d1f] md:text-[34px]">
              在对话下面直接挑一套模板
            </h3>
            <p className="mt-2 max-w-[760px] text-[14px] leading-[1.65] text-black/48">
              这里的模板会直接影响封面、排版、配色和整体气质。先选风格，再开始生成会更稳定。
            </p>
          </motion.div>

          <motion.div variants={ITEM_ENTER_VARIANTS} className="rounded-[24px] border border-[#2f6fed]/12 bg-[#f7faff] px-5 py-4 xl:max-w-[360px]">
            <div className="text-[12px] font-medium text-[#2f6fed]">当前选择</div>
            <div className="mt-2 text-[18px] font-semibold leading-[1.3] text-[#1d1d1f]">
              {selectedTemplateMeta?.label ?? '自由设计'}
            </div>
            <div className="mt-2 text-[13px] leading-[1.65] text-black/48">
              {selectedTemplateMeta?.summary ?? '不锁定固定模板，系统会根据你的主题和内容自动排版。'}
            </div>
          </motion.div>
        </motion.div>

        <motion.div className="mt-5 flex flex-wrap gap-2" variants={STAGGER_BLOCK_VARIANTS}>
          <motion.div variants={ITEM_ENTER_VARIANTS}>
            <CategoryChip active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
              {getLocalizedCategoryLabel('all', '全部')}
            </CategoryChip>
          </motion.div>
          {templateCategoryEntries.map(([key, category]) => (
            <motion.div key={key} variants={ITEM_ENTER_VARIANTS}>
              <CategoryChip active={activeCategory === key} onClick={() => setActiveCategory(key)}>
                {getLocalizedCategoryLabel(key, category.label)}
              </CategoryChip>
            </motion.div>
          ))}
        </motion.div>

        <motion.div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" variants={STAGGER_CARD_VARIANTS}>
          <motion.button
            type="button"
            variants={CARD_ENTER_VARIANTS}
            whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
            onClick={() => handleTemplateSelection(null)}
            className={`studio-template-card ${selectedTemplateId === null ? 'studio-template-card-active' : ''}`}
          >
            <div className="studio-template-card__preview bg-[radial-gradient(circle_at_top_left,_rgba(47,111,237,0.18),_transparent_36%),linear-gradient(180deg,_#fbfcff_0%,_#f2f5fb_100%)]">
              <div className="rounded-full border border-[#2f6fed]/12 bg-white/88 px-3 py-1 text-[11px] font-medium text-[#2f6fed]">
                推荐
              </div>
              <div className="max-w-[210px]">
                <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f]">自由设计</div>
                <div className="mt-2 text-[13px] leading-[1.6] text-black/50">
                  如果你只是想快速开始，这个模式会按照主题自动选择最合适的表达方式。
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[16px] font-semibold text-[#1d1d1f]">系统自动匹配</div>
                {selectedTemplateId === null && <Check className="h-4 w-4 text-[#2f6fed]" />}
              </div>
              <div className="mt-2 text-[13px] leading-[1.65] text-black/48">适合先把内容跑通，再根据生成结果继续细调。</div>
            </div>
          </motion.button>

          {templateEntries.map((template) => {
            const selected = selectedTemplateId === template.id;
            const localized = getLocalizedTemplateMeta(template.id, template.label, template.summary);

            return (
              <motion.button
                key={template.id}
                type="button"
                variants={CARD_ENTER_VARIANTS}
                whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
                onClick={() => handleTemplateSelection(selected ? null : template.id)}
                className={`studio-template-card ${selected ? 'studio-template-card-active' : ''}`}
              >
                <div className="studio-template-card__preview bg-[#f3f4f7]">
                  {template.thumbnail ? (
                    <img src={template.thumbnail} alt={localized.label} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <LayoutTemplate className="h-7 w-7 text-black/18" />
                    </div>
                  )}
                </div>
                <div className="px-5 pb-5 pt-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[16px] font-semibold leading-[1.35] text-[#1d1d1f]">{localized.label}</div>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6fed]" />}
                  </div>
                  <div className="mt-2 line-clamp-3 text-[13px] leading-[1.7] text-black/48">{localized.summary}</div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </motion.section>
  );
  const landingPage = (
    <motion.div
      key="landing-page"
      className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]"
      variants={PAGE_SHELL_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.header
        className="landing-nav"
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.52, ease: MOTION_EASE }}
      >
        <div className="landing-nav__inner">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="landing-brand">
            <span className="landing-brand__mark">
              <Presentation className="h-4 w-4" />
            </span>
            <span>PPT Master</span>
          </button>

          <nav className="landing-nav__links hidden md:flex">
            <button type="button" onClick={() => scrollToLandingSection(landingFeaturesRef)}>
              能力介绍
            </button>
            <button type="button" onClick={() => scrollToLandingSection(templateSectionRef)}>
              模板预览
            </button>
            <button type="button" onClick={() => scrollToLandingSection(landingWorkflowRef)}>
              制作流程
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => scrollToLandingSection(templateSectionRef)} className="landing-nav__ghost hidden sm:inline-flex">
              查看模板
            </button>
            <button type="button" onClick={openStudio} className="landing-nav__cta">
              开始制作 PPT
            </button>
          </div>
        </div>
      </motion.header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__inner">
            <motion.div className="landing-hero__copy" variants={STAGGER_BLOCK_VARIANTS} initial="hidden" animate="visible">
              <motion.div className="landing-hero__eyebrow" variants={ITEM_ENTER_VARIANTS}>
                AI Presentation Studio
              </motion.div>
              <motion.h1 className="landing-hero__title" variants={ITEM_ENTER_VARIANTS}>
                从一句需求，到一份真正可编辑的演示文稿。
              </motion.h1>
              <motion.p className="landing-hero__description" variants={ITEM_ENTER_VARIANTS}>
                先用 Apple 式的官网体验建立信任，再进入工作台完成大纲、模板、生成和导出。它不是一个表单，而是一套完整的 PPT 制作界面。
              </motion.p>

              <motion.div className="landing-hero__actions" variants={ITEM_ENTER_VARIANTS}>
                <button type="button" onClick={openStudio} className="landing-button-primary">
                  开启制作 PPT
                </button>
                <button type="button" onClick={() => scrollToLandingSection(templateSectionRef)} className="landing-button-secondary">
                  先看模板
                </button>
              </motion.div>

              <motion.div className="landing-hero__meta" variants={ITEM_ENTER_VARIANTS}>
                <span>模板预选</span>
                <span>大纲可编辑</span>
                <span>PPTX 导出</span>
              </motion.div>
            </motion.div>

            <motion.div className="landing-hero__visual" variants={HERO_VISUAL_VARIANTS} initial="hidden" animate="visible">
              <motion.div
                className="landing-device"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6.8, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' }}
              >
                <div className="landing-device__top">
                  <div className="landing-device__brand">PPT Master Studio</div>
                  <div className="landing-device__status">{selectedTemplateMeta?.label ?? '自由设计'}</div>
                </div>

                <div className="landing-device__hero">
                  <div>
                    <div className="landing-device__kicker">Presentation Workflow</div>
                    <div className="landing-device__headline">Outline. Template. Render.</div>
                    <div className="landing-device__copy">像产品发布页一样展示能力，像工作台一样完成生成。</div>
                  </div>
                  <div className="landing-device__cta">Studio Ready</div>
                </div>

                <div className="landing-device__grid">
                  <div className="landing-device__card landing-device__card-light">
                    <div className="landing-device__card-label">输入</div>
                    <div className="landing-device__card-title">一句话或文档</div>
                  </div>
                  <div className="landing-device__card landing-device__card-dark">
                    <div className="landing-device__card-label">模板</div>
                    <div className="landing-device__card-title">品牌 / 答辩 / 政企</div>
                  </div>
                  <div className="landing-device__card landing-device__card-light">
                    <div className="landing-device__card-label">输出</div>
                    <div className="landing-device__card-title">可继续修改的 PPTX</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <motion.section
          ref={landingFeaturesRef}
          className="landing-section landing-section-light"
          variants={SECTION_ENTER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.18 }}
        >
          <div className="landing-section__inner">
            <motion.div className="landing-section__head" variants={STAGGER_BLOCK_VARIANTS}>
              <motion.div className="landing-section__eyebrow" variants={ITEM_ENTER_VARIANTS}>
                Core Experience
              </motion.div>
              <motion.h2 className="landing-section__title" variants={ITEM_ENTER_VARIANTS}>
                官网负责建立气质，工作台负责把内容做出来。
              </motion.h2>
              <motion.p className="landing-section__description" variants={ITEM_ENTER_VARIANTS}>
                前置页不再只是一个普通入口，而是把产品能力、模板体系和制作流程像作品一样展示出来。
              </motion.p>
            </motion.div>

            <motion.div className="landing-feature-grid" variants={STAGGER_CARD_VARIANTS}>
              {LANDING_FEATURES.map((feature) => (
                <motion.article
                  key={feature.title}
                  className="landing-feature-card"
                  variants={CARD_ENTER_VARIANTS}
                  whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
                >
                  <div className="landing-feature-card__eyebrow">{feature.eyebrow}</div>
                  <h3 className="landing-feature-card__title">{feature.title}</h3>
                  <p className="landing-feature-card__description">{feature.description}</p>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          ref={templateSectionRef}
          className="landing-section landing-section-dark"
          variants={SECTION_ENTER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.14 }}
        >
          <div className="landing-section__inner">
            <motion.div className="landing-section__head landing-section__head-dark" variants={STAGGER_BLOCK_VARIANTS}>
              <motion.div className="landing-section__eyebrow landing-section__eyebrow-dark" variants={ITEM_ENTER_VARIANTS}>
                Template Gallery
              </motion.div>
              <motion.h2 className="landing-section__title landing-section__title-dark" variants={ITEM_ENTER_VARIANTS}>
                先挑视觉语言，再进入制作。
              </motion.h2>
              <motion.p className="landing-section__description landing-section__description-dark" variants={ITEM_ENTER_VARIANTS}>
                这里就是前置页最重要的一块。用户可以像逛产品陈列一样浏览模板，然后带着选择进入工作台。
              </motion.p>
            </motion.div>

            <motion.div className="landing-template-toolbar" variants={STAGGER_BLOCK_VARIANTS}>
              <div className="flex flex-wrap gap-2">
                <CategoryChip active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
                  {getLocalizedCategoryLabel('all', '全部模板')}
                </CategoryChip>
                {templateCategoryEntries.map(([key, category]) => (
                  <CategoryChip key={key} active={activeCategory === key} onClick={() => setActiveCategory(key)}>
                    {getLocalizedCategoryLabel(key, category.label)}
                  </CategoryChip>
                ))}
              </div>

              <div className="landing-template-toolbar__current">
                <span className="landing-template-toolbar__label">当前选择</span>
                <span className="landing-template-toolbar__value">{selectedTemplateMeta?.label ?? '自由设计'}</span>
              </div>
            </motion.div>

            <motion.div className="landing-template-grid" variants={STAGGER_CARD_VARIANTS}>
              <motion.button
                type="button"
                variants={CARD_ENTER_VARIANTS}
                whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
                onClick={() => handleTemplateSelection(null)}
                className={`studio-template-card ${selectedTemplateId === null ? 'studio-template-card-active' : ''}`}
              >
                <div className="studio-template-card__preview bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.2),_transparent_32%),linear-gradient(180deg,_#1f1f22_0%,_#2a2a2d_100%)]">
                  <div className="rounded-full border border-white/16 bg-white/8 px-3 py-1 text-[11px] font-medium text-white/78">System Default</div>
                  <div className="max-w-[220px] self-end">
                    <div className="text-[23px] font-semibold tracking-[-0.03em] text-white">自由设计</div>
                    <div className="mt-2 text-[13px] leading-[1.65] text-white/62">让系统根据你的主题和内容自动挑选最合适的整体表达方式。</div>
                  </div>
                </div>
                <div className="px-5 pb-5 pt-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[16px] font-semibold text-[#1d1d1f]">系统自动匹配</div>
                    {selectedTemplateId === null && <Check className="h-4 w-4 text-[#0071e3]" />}
                  </div>
                  <div className="mt-2 text-[13px] leading-[1.65] text-black/48">适合先快速开始，后续再根据大纲和生成效果继续打磨。</div>
                </div>
              </motion.button>

              {(activeCategory === 'all' ? landingTemplateEntries : templateEntries).map((template) => {
                const selected = selectedTemplateId === template.id;
                const localized = getLocalizedTemplateMeta(template.id, template.label, template.summary);

                return (
                  <motion.button
                    key={template.id}
                    type="button"
                    variants={CARD_ENTER_VARIANTS}
                    whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
                    onClick={() => handleTemplateSelection(selected ? null : template.id)}
                    className={`studio-template-card ${selected ? 'studio-template-card-active' : ''}`}
                  >
                    <div className="studio-template-card__preview bg-[#1c1c1e]">
                      {template.thumbnail ? (
                        <img src={template.thumbnail} alt={localized.label} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <LayoutTemplate className="h-8 w-8 text-white/28" />
                        </div>
                      )}
                    </div>
                    <div className="px-5 pb-5 pt-4 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[16px] font-semibold leading-[1.35] text-[#1d1d1f]">{localized.label}</div>
                        {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0071e3]" />}
                      </div>
                      <div className="mt-2 line-clamp-3 text-[13px] leading-[1.7] text-black/48">{localized.summary}</div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>

            <motion.div className="landing-template-actions" variants={ITEM_ENTER_VARIANTS}>
              <button type="button" onClick={openStudio} className="landing-button-primary">
                带着当前模板进入工作台
              </button>
              <button type="button" onClick={openStudio} className="landing-button-secondary landing-button-secondary-dark">
                直接开始输入需求
              </button>
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          ref={landingWorkflowRef}
          className="landing-section landing-section-light"
          variants={SECTION_ENTER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.18 }}
        >
          <div className="landing-section__inner">
            <motion.div className="landing-section__head" variants={STAGGER_BLOCK_VARIANTS}>
              <motion.div className="landing-section__eyebrow" variants={ITEM_ENTER_VARIANTS}>
                Workflow
              </motion.div>
              <motion.h2 className="landing-section__title" variants={ITEM_ENTER_VARIANTS}>
                进入制作后，整个流程是连续的。
              </motion.h2>
              <motion.p className="landing-section__description" variants={ITEM_ENTER_VARIANTS}>
                不是点一下就直接生成成品，而是先整理大纲、再编辑、再生成，这样结果更可控。
              </motion.p>
            </motion.div>

            <motion.div className="landing-workflow-grid" variants={STAGGER_CARD_VARIANTS}>
              {LANDING_WORKFLOW.map((item) => (
                <motion.article
                  key={item.step}
                  className="landing-workflow-card"
                  variants={CARD_ENTER_VARIANTS}
                  whileHover={{ y: -6, transition: { duration: 0.2, ease: MOTION_EASE } }}
                >
                  <div className="landing-workflow-card__step">{item.step}</div>
                  <h3 className="landing-workflow-card__title">{item.title}</h3>
                  <p className="landing-workflow-card__description">{item.description}</p>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          className="landing-final"
          variants={SECTION_ENTER_VARIANTS}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.24 }}
        >
          <div className="landing-final__inner">
            <motion.div className="landing-final__eyebrow" variants={ITEM_ENTER_VARIANTS}>
              Ready to Build
            </motion.div>
            <motion.h2 className="landing-final__title" variants={ITEM_ENTER_VARIANTS}>
              让网站先把人吸引进来，再让工作台把 PPT 做出来。
            </motion.h2>
            <motion.p className="landing-final__description" variants={ITEM_ENTER_VARIANTS}>
              这会比直接落到一个输入框更像成熟产品，也更符合你前面要的 Apple 式前置页气质。
            </motion.p>
            <motion.div className="landing-final__actions" variants={ITEM_ENTER_VARIANTS}>
              <button type="button" onClick={openStudio} className="landing-button-primary">
                进入 PPT 工作台
              </button>
              <button type="button" onClick={() => scrollToLandingSection(templateSectionRef)} className="landing-button-secondary landing-button-secondary-dark">
                浏览模板陈列
              </button>
            </motion.div>
          </div>
        </motion.section>
      </main>
    </motion.div>
  );

  const studioPage = (
    <motion.div
      key="studio-page"
      className="min-h-screen bg-[#fcfcfd] text-[#161616]"
      variants={PAGE_SHELL_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <AnimatePresence>
        {isMobileViewport && mobileSidebarOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/12 backdrop-blur-[2px] lg:hidden"
          />
        )}
      </AnimatePresence>

      <div className="flex min-h-screen">
        <aside
          className={`studio-sidebar ${
            isMobileViewport
              ? `fixed inset-y-0 left-0 z-40 flex max-w-[88vw] ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
              : 'sticky top-0 flex h-screen'
          } ${compactSidebar ? 'w-[88px] min-w-[88px]' : 'w-[272px] min-w-[272px]'}`}
        >
          <div className="studio-sidebar__header">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#2f6fed] text-white">
                <Presentation className="h-4 w-4" />
              </div>
              {!compactSidebar && (
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[#2f2f33]">PPT Master</div>
                  <div className="mt-0.5 text-[11px] text-black/36">Presentation Studio</div>
                </div>
              )}
            </div>
            <button
              type="button"
              title={isMobileViewport ? '关闭侧栏' : compactSidebar ? '展开侧栏' : '收起侧栏'}
              onClick={() => {
                if (isMobileViewport) {
                  setMobileSidebarOpen(false);
                  return;
                }
                setSidebarCollapsed((collapsed) => !collapsed);
              }}
              className="text-black/28 transition-colors hover:text-black/48"
            >
              {isMobileViewport ? (
                <X className="h-4 w-4" />
              ) : compactSidebar ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <button
            type="button"
            title="新建会话"
            onClick={() => {
              handleResetWorkspace();
              window.setTimeout(() => promptTextareaRef.current?.focus(), 60);
            }}
            className={`studio-new-chat ${compactSidebar ? 'justify-center px-0' : ''}`}
          >
            <Plus className="h-4 w-4" />
            {!compactSidebar && (
              <>
                <span>新建会话</span>
                <span className="rounded-full bg-[#f7f7f9] px-2 py-0.5 text-[10px] text-black/36">New</span>
              </>
            )}
          </button>

          <div className="mt-7 flex-1 overflow-y-auto pr-1 no-scrollbar">
            {compactSidebar ? (
              <div className="space-y-2">
                {visibleRecentPrompts.slice(0, 4).map((item) => {
                  const active = item.prompt.trim() === promptText.trim();
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.title}
                      onClick={() => handleSelectRecentPrompt(item)}
                      className={`studio-session-item justify-center px-0 ${active ? 'studio-session-item-active' : ''}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-black/28" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                {!!recentThisWeek.length && (
                  <>
                    <div className="studio-sidebar__section-label">本周</div>
                    <div className="space-y-2">
                      {recentThisWeek.map((item) => {
                        const active = item.prompt.trim() === promptText.trim();
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectRecentPrompt(item)}
                            className={`studio-session-item ${active ? 'studio-session-item-active' : ''}`}
                          >
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/28" />
                            <span className="line-clamp-2 text-left">{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {!!recentEarlier.length && (
                  <>
                    <div className="studio-sidebar__section-label mt-6">更早</div>
                    <div className="space-y-2">
                      {recentEarlier.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectRecentPrompt(item)}
                          className="studio-session-item"
                        >
                          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/24" />
                          <span className="line-clamp-2 text-left">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {!recentThisWeek.length && !recentEarlier.length && (
                  <div className="rounded-[18px] border border-dashed border-black/[0.08] bg-white/70 px-4 py-4 text-[12px] leading-[1.6] text-black/40">
                    这里会记录你最近使用过的主题，方便重新开始一份新稿。
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 pt-4">
            {!compactSidebar && (
              <button type="button" className="studio-invite-card">
                <div className="flex items-center gap-3">
                  <Gift className="h-4 w-4 text-black/48" />
                  <div className="text-left">
                    <div className="text-[13px] font-medium text-[#2f2f33]">邀请好友来生成 PPT</div>
                    <div className="mt-1 text-[11px] text-black/40">共同可得 500 积分</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-black/24" />
              </button>
            )}

            <div
              className={`rounded-[18px] border border-black/[0.06] bg-white ${
                compactSidebar ? 'flex flex-col items-center gap-2 px-3 py-3' : 'flex items-center justify-between px-4 py-3'
              }`}
            >
              <button
                type="button"
                title="回到输入区"
                onClick={() => {
                  if (isMobileViewport) setMobileSidebarOpen(false);
                  focusPromptComposer();
                }}
                className="studio-bottom-icon"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="打开模板选择"
                onClick={() => {
                  if (isMobileViewport) setMobileSidebarOpen(false);
                  toggleTemplatePicker();
                }}
                className="studio-bottom-icon"
              >
                <LayoutTemplate className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={phase === 'idle' ? '聚焦输入框' : '聚焦 AI 调整'}
                onClick={() => {
                  if (isMobileViewport) setMobileSidebarOpen(false);
                  focusRevisionComposer();
                }}
                className="studio-bottom-icon"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="relative flex-1">
          <div className="absolute left-4 top-4 z-20 lg:hidden">
            <button type="button" onClick={() => setMobileSidebarOpen(true)} className="studio-top-pill">
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>

          <div className="pointer-events-none absolute right-5 top-4 z-20 flex items-center gap-3">
            <button type="button" onClick={openLanding} className="studio-top-pill pointer-events-auto hidden sm:inline-flex">
              首页
            </button>
            <button type="button" onClick={toggleTemplatePicker} className="studio-top-pill pointer-events-auto">
              模板
            </button>
            <div className="studio-top-pill pointer-events-auto">{outline.length ? `${outline.length} 页` : `${slideCount} 页`}</div>
            <button type="button" onClick={focusPromptComposer} className="studio-avatar pointer-events-auto">
              <UserRound className="h-4 w-4" />
            </button>
          </div>

          <main className="flex min-h-screen flex-col px-6 pb-8 pt-20 lg:px-10">
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mx-auto mb-4 flex w-full max-w-[720px] items-start gap-3 rounded-[18px] border border-[#ffd6d6] bg-[#fff2f2] px-4 py-3"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#d70015]" />
                  <div className="flex-1 text-[13px] leading-[1.5] text-[#d70015]">{errorMessage}</div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-[#d70015]/60 hover:text-[#d70015]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {phase === 'idle' ? (
              <motion.section
                key="studio-idle"
                className="flex flex-1 flex-col items-center justify-center pb-10"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.62, ease: MOTION_EASE }}
              >
                <motion.div className="mx-auto w-full max-w-[760px] text-center" variants={STAGGER_BLOCK_VARIANTS} initial="hidden" animate="visible">
                  <motion.h1 variants={ITEM_ENTER_VARIANTS} className="whitespace-pre-line font-display text-[44px] font-semibold leading-[1.12] tracking-[-0.04em] text-[#141419] md:text-[58px]">
                    {phaseHeadline(phase, outline.length)}
                  </motion.h1>
                  <motion.p variants={ITEM_ENTER_VARIANTS} className="mt-4 text-[16px] text-black/36">{phaseSubcopy(phase)}</motion.p>

                  <motion.div
                    variants={ITEM_ENTER_VARIANTS}
                    onDragEnter={handlePromptDropEnter}
                    onDragLeave={handlePromptDropLeave}
                    onDragOver={handlePromptDropOver}
                    onDrop={handlePromptDrop}
                    className={`studio-dropzone mt-9 rounded-[24px] border border-black/[0.08] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${
                      promptDropActive ? 'studio-dropzone-active' : ''
                    }`}
                  >
                    <textarea
                      ref={promptTextareaRef}
                      value={promptText}
                      onChange={(event) => setPromptText(event.target.value)}
                      onKeyDown={handlePromptComposerKeyDown}
                      placeholder="描述你的主题..."
                      rows={4}
                      className="studio-prompt-textarea"
                    />
                    <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-black/42 transition-colors hover:text-[#2f6fed]">
                          <Paperclip className="h-4 w-4" />
                          <span>添加文件</span>
                          <input
                            type="file"
                            className="hidden"
                            accept={SOURCE_FILE_ACCEPT}
                            onChange={(event) => {
                              handleAttachFile(event.target.files?.[0] ?? null);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                        <span className="text-[12px] text-black/32">支持 PDF / Word / Markdown，也可以直接拖进来</span>
                        {attachedFile && (
                          <div className="studio-attachment-chip max-w-full">
                            <span className="truncate">{attachedFile.name}</span>
                            <span className="text-black/36">{formatFileSize(attachedFile.size)}</span>
                            <button
                              type="button"
                              title="移除附件"
                              onClick={handleRemoveAttachedFile}
                              className="text-black/36 transition-colors hover:text-[#1d1d1f]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <span className="text-[12px] text-black/32">Ctrl / Cmd + Enter</span>
                        <button
                          type="button"
                          onClick={handleDraftOutline}
                          disabled={phase === 'drafting' || !hasPromptInput}
                          className={`studio-send-button ${hasPromptInput ? 'studio-send-button-active' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {phase === 'drafting' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {attachedFile && promptText.trim() && (
                      <div className="mt-3 text-left text-[12px] text-black/40">
                        会以附件内容为主，当前文字会作为补充要求一起发送给 AI。
                      </div>
                    )}
                  </motion.div>

                  <motion.div variants={ITEM_ENTER_VARIANTS} className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {PROMPT_SUGGESTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => selectPromptSuggestion(item)}
                        className={`studio-chip ${promptText.trim() === item ? 'studio-chip-active' : ''}`}
                      >
                        {item}
                      </button>
                    ))}
                  </motion.div>

                  <motion.div variants={ITEM_ENTER_VARIANTS} className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="studio-chip">
                      参数设置
                      {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <span className="studio-chip">{slideCount} 页</span>
                    <span className="studio-chip">{selectedTemplateMeta?.label ?? '自由设计'}</span>
                    <span className="studio-chip">{autoChart ? '智能图表已开启' : '智能图表已关闭'}</span>
                  </motion.div>

                  {advancedOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.38, ease: MOTION_EASE }}
                      className="mx-auto mt-4 max-w-[760px] rounded-[24px] border border-black/[0.08] bg-white px-5 py-5 text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                    >
                      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
                        <div>
                          <div className="text-[13px] font-medium text-[#1d1d1f]">页数控制</div>
                          <div className="mt-1 text-[12px] text-black/48">控制期望输出的页数范围</div>
                          <div className="mt-3 flex items-center gap-3">
                            <input
                              type="range"
                              min="5"
                              max="50"
                              value={slideCount}
                              onChange={(event) => setSlideCount(parseInt(event.target.value, 10))}
                              className="w-full"
                            />
                            <span className="min-w-[40px] text-right text-[13px] font-medium text-[#2f6fed]">
                              {slideCount}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="flex items-center justify-between rounded-[16px] bg-[#f7f7f8] px-4 py-3">
                            <div>
                              <div className="text-[13px] font-medium text-[#1d1d1f]">智能图表页</div>
                              <div className="mt-1 text-[12px] text-black/48">遇到数据型内容时自动补充适合的图表页面</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={autoChart}
                              onChange={(event) => setAutoChart(event.target.checked)}
                            />
                          </label>

                          <div className="rounded-[16px] bg-[#f7f7f8] px-4 py-4">
                            <div className="text-[13px] font-medium text-[#1d1d1f]">当前模板</div>
                            <div className="mt-1 text-[12px] text-black/48">
                              {selectedTemplateMeta?.label ?? '自由设计'} ·{' '}
                              {selectedTemplateMeta?.summary ?? '不指定固定模板，由系统自动匹配最合适的版式。'}
                            </div>
                            <button
                              type="button"
                              onClick={scrollToTemplateSection}
                              className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-[#2f6fed]"
                            >
                              去下方模板区选择
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>

                {idleTemplateExplorer}

                <motion.div
                  className="mt-14 w-full max-w-[1180px]"
                  variants={SECTION_ENTER_VARIANTS}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.16 }}
                >
                  <div className="mb-4 text-[12px] font-medium text-black/36">生成案例</div>
                  <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={STAGGER_CARD_VARIANTS}>
                    {SHOWCASE_ITEMS.map((item) => (
                      <motion.button
                        key={item.title}
                        type="button"
                        variants={CARD_ENTER_VARIANTS}
                        whileHover={{ y: -5, transition: { duration: 0.2, ease: MOTION_EASE } }}
                        onClick={() => applyShowcasePrompt(item.prompt)}
                        className="studio-showcase-card"
                      >
                        <div className={`studio-showcase-card__preview bg-gradient-to-br ${item.previewClass}`}>
                          <div className={`text-left ${item.title.includes('Dify') ? 'text-white' : 'text-[#1d1d1f]'}`}>
                            <div className="text-[10px] opacity-60">{item.accent}</div>
                            <div className="mt-2 text-[15px] font-semibold leading-[1.3]">{item.title}</div>
                          </div>
                        </div>
                        <div className="px-4 pb-4 pt-3 text-left">
                          <div className="text-[14px] font-medium text-[#1d1d1f]">{item.title}</div>
                          <div className="mt-1 text-[12px] text-black/36">{item.subtitle}</div>
                        </div>
                      </motion.button>
                    ))}
                  </motion.div>
                </motion.div>
              </motion.section>
            ) : (
              <motion.section
                key="studio-workspace"
                className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-6 xl:flex-row"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.62, ease: MOTION_EASE }}
              >
                <aside className="w-full shrink-0 space-y-4 xl:w-[320px]">
                  <div className="studio-card p-5">
                    <div className="text-[12px] font-medium text-black/36">当前需求</div>
                    <div className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.6] text-[#1d1d1f]">
                      {promptText || '当前大纲来自上传文档。'}
                    </div>
                    {attachedFile && (
                      <div className="mt-3 text-[12px] text-black/40">
                        附件 · <span className="text-[#2f6fed]">{attachedFile.name}</span>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="studio-chip">{outline.length} 页</span>
                      <span className="studio-chip">{selectedTemplateMeta?.label ?? '自由设计'}</span>
                    </div>
                  </div>

                  <div className="studio-card p-5">
                    <div className="text-[12px] font-medium text-black/36">继续让 AI 调整</div>
                    <textarea
                      ref={reviseTextareaRef}
                      value={reviseInstruction}
                      onChange={(event) => setReviseInstruction(event.target.value)}
                      onKeyDown={handleReviseComposerKeyDown}
                      placeholder="例如：补一页风险与应对；第 3 页改成对比结构；整体更简洁。"
                      rows={4}
                      className="studio-textarea mt-3"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-[12px] text-black/32">Ctrl / Cmd + Enter</div>
                      <button
                        type="button"
                        onClick={handleReviseOutline}
                        disabled={phase === 'drafting' || phase === 'generating' || !reviseInstruction.trim()}
                        className="studio-outline-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RefreshCw className="h-4 w-4" />
                        让 AI 调整
                      </button>
                    </div>
                  </div>

                  <div className="studio-card p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[12px] font-medium text-black/36">生成参数</div>
                        <div className="mt-1 text-[13px] text-black/56">修改后会影响下一次生成</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div className="rounded-[16px] bg-[#f7f7f8] px-4 py-4">
                        <div className="flex items-center justify-between text-[13px] text-[#1d1d1f]">
                          <span>当前页数</span>
                          <span className="font-medium text-[#2f6fed]">{outline.length}</span>
                        </div>
                        <div className="mt-1 text-[12px] leading-[1.6] text-black/48">
                          生成页数会跟随右侧大纲，想增减页面请直接编辑大纲，或告诉 AI 重新调整结构。
                        </div>
                      </div>

                      <label className="flex items-center justify-between rounded-[16px] bg-[#f7f7f8] px-4 py-3">
                        <div>
                          <div className="text-[13px] text-[#1d1d1f]">智能图表页</div>
                          <div className="mt-1 text-[12px] text-black/48">切换后会在下次生成时生效</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={autoChart}
                          onChange={(event) => {
                            setAutoChart(event.target.checked);
                            markOutlineDirty();
                          }}
                        />
                      </label>

                      <div ref={editorTemplateRef} className="rounded-[16px] bg-[#f7f7f8] px-4 py-4">
                        <button
                          type="button"
                          onClick={toggleTemplatePicker}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div>
                            <div className="text-[13px] text-[#1d1d1f]">{selectedTemplateMeta?.label ?? '自由设计'}</div>
                            <div className="mt-1 text-[12px] text-black/48">
                              {selectedTemplateMeta?.summary ?? '可以切换模板，但会影响下一次生成结果。'}
                            </div>
                          </div>
                          {templatePickerOpen ? (
                            <ChevronUp className="h-4 w-4 text-black/36" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-black/36" />
                          )}
                        </button>

                        {templatePickerOpen && templatePickerBody}
                      </div>
                    </div>
                  </div>

                  {downloadInfo && (
                    <div className="studio-card p-5">
                      <div className="text-[12px] font-medium text-black/36">导出文件</div>
                      <div className="mt-3 text-[15px] font-medium text-[#1d1d1f]">{downloadInfo.filename}</div>
                      <div className="mt-1 text-[12px] text-black/40">{formatFileSize(downloadInfo.size)}</div>
                      <button type="button" onClick={handleDownload} className="studio-outline-primary mt-4">
                        <Download className="h-4 w-4" />
                        下载 .pptx
                      </button>
                    </div>
                  )}
                </aside>

                <section className="relative min-w-0 flex-1">
                  <AnimatePresence>
                    {phase === 'generating' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 flex items-center justify-center rounded-[24px] bg-white/70 backdrop-blur-md"
                      >
                        <div className="w-full max-w-[480px] rounded-[28px] border border-black/[0.06] bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f6ff] text-[#2f6fed]">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                            <div>
                              <div className="text-[20px] font-semibold text-[#1d1d1f]">正在生成 PPT</div>
                              <div className="mt-1 text-[13px] text-black/48">{taskSummary(task)}</div>
                            </div>
                          </div>

                          <div className="mt-5">
                            <div className="mb-2 flex items-center justify-between text-[12px] text-black/40">
                              <span>{task?.status ?? 'queued'}</span>
                              <span>{progressValue}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#eef0f5]">
                              <div
                                className="h-full rounded-full bg-[#2f6fed] transition-all duration-500"
                                style={{ width: `${progressValue}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="studio-card overflow-hidden">
                    <div className="border-b border-black/[0.06] px-6 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <div className="text-[12px] font-medium text-black/36">{phaseLabel(phase)}</div>
                          <h2 className="mt-2 whitespace-pre-line font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#1d1d1f]">
                            {phaseHeadline(phase, outline.length)}
                          </h2>
                          <p className="mt-2 max-w-[620px] text-[14px] leading-[1.55] text-black/48">
                            {phaseSubcopy(phase)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="rounded-[18px] bg-[#f7f7f8] px-4 py-3 text-center">
                            <div className="text-[11px] text-black/32">页数</div>
                            <div className="mt-1 text-[18px] font-semibold text-[#1d1d1f]">{outline.length}</div>
                          </div>
                          <div className="rounded-[18px] bg-[#f7f7f8] px-4 py-3 text-center">
                            <div className="text-[11px] text-black/32">要点</div>
                            <div className="mt-1 text-[18px] font-semibold text-[#1d1d1f]">{totalPoints}</div>
                          </div>
                          <button
                            type="button"
                            onClick={handleStartGeneration}
                            disabled={!outline.length || phase === 'drafting' || phase === 'generating'}
                            className="studio-outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Sparkles className="h-4 w-4" />
                            {phase === 'done' ? '重新生成' : '开始生成'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {phase === 'drafting' && outline.length > 0 && (
                      <div className="border-b border-black/[0.06] bg-[#f8fafc] px-6 py-3 text-[13px] text-black/48">
                        AI 正在根据你的最新指令重写大纲，完成后这里会自动刷新。
                      </div>
                    )}

                    <div className="px-4 py-4 lg:px-5 lg:py-5">
                      <div className="grid gap-4 2xl:grid-cols-2">
                        {outline.map((slide, index) => (
                          <EditableSlideCard
                            key={`${slide.id}-${index}`}
                            slide={slide}
                            index={index}
                            total={outline.length}
                            onChange={(patch) => patchSlide(index, patch)}
                            onDelete={() => deleteSlide(index)}
                            onDuplicate={() => duplicateSlide(index)}
                            onMove={(dir) => moveSlide(index, index + dir)}
                            onInsertAfter={() => insertAfter(index)}
                            onDragStart={(event) => {
                              dragIndexRef.current = index;
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              dragIndexRef.current = null;
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const from = dragIndexRef.current;
                              dragIndexRef.current = null;
                              if (from === null || from === index) return;
                              moveSlide(from, index);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </motion.section>
            )}
          </main>
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      {appView === 'landing' ? landingPage : studioPage}
    </AnimatePresence>
  );
}

export default App;
