import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud,
  Download,
  Presentation,
  LayoutTemplate,
  Sparkles,
  Loader2,
  Paperclip,
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Edit3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  createProject,
  draftOutline,
  getDownloadInfo,
  getDownloadUrl,
  getPreviewUrl,
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

const LAYOUT_OPTIONS = ['cover', 'content', 'section', 'comparison', 'chart', 'summary'];

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

interface EditableSlideProps {
  key?: React.Key;
  slide: SlideOutline;
  index: number;
  total: number;
  onChange: (patch: Partial<SlideOutline>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertAfter: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

function EditableSlide({
  slide,
  index,
  total,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  onInsertAfter,
  onDragStart,
  onDragOver,
  onDrop,
}: EditableSlideProps) {
  const [pointsText, setPointsText] = useState((slide.points ?? []).join('\n'));

  useEffect(() => {
    setPointsText((slide.points ?? []).join('\n'));
  }, [slide.points]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="bg-[#161616] group rounded-[3px] border border-[#2A2A2A] overflow-hidden flex flex-col hover:border-[#3A3A3A] transition-all"
    >
      <div className="px-4 py-2 bg-[#111] border-b border-[#2A2A2A] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3 text-[#777]">
          <span className="font-mono">#{String(index + 1).padStart(2, '0')}</span>
          <select
            value={slide.layout || 'content'}
            onChange={(e) => onChange({ layout: e.target.value })}
            className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[2px] text-[#C5A059] px-2 py-1 text-[11px] outline-none cursor-pointer"
          >
            {LAYOUT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn title="上移" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="下移" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="复制" onClick={onDuplicate}>
            <Copy className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="删除" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <input
          value={slide.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="幻灯片标题"
          className="bg-transparent text-[16px] text-[#E5E5E5] font-light outline-none border-b border-transparent focus:border-[#C5A059]/40 pb-1"
        />
        <textarea
          value={slide.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="副标题或描述"
          rows={2}
          className="bg-[#1A1A1A] rounded-[2px] px-3 py-2 text-[13px] text-[#BBB] outline-none border border-[#2A2A2A] focus:border-[#C5A059]/40 resize-none"
        />
        <textarea
          value={pointsText}
          onChange={(e) => setPointsText(e.target.value)}
          onBlur={() =>
            onChange({
              points: pointsText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
          placeholder="每行一个要点"
          rows={Math.max(3, pointsText.split('\n').length)}
          className="bg-[#1A1A1A] rounded-[2px] px-3 py-2 text-[12px] text-[#999] outline-none border border-[#2A2A2A] focus:border-[#C5A059]/40 resize-none font-mono leading-relaxed"
        />
      </div>

      <button
        onClick={onInsertAfter}
        className="h-7 border-t border-dashed border-[#2A2A2A] text-[10px] text-[#555] hover:text-[#C5A059] hover:bg-[#1A1A1A] transition-colors flex items-center justify-center gap-1 uppercase tracking-[1px]"
      >
        <Plus className="w-3 h-3" />
        在下方插入一页
      </button>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-[2px] transition-colors ${
        disabled
          ? 'text-[#333] cursor-not-allowed'
          : 'text-[#777] hover:text-[#C5A059] hover:bg-[#1A1A1A]'
      }`}
    >
      {children}
    </button>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [promptText, setPromptText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState(10);
  const [autoChart, setAutoChart] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [templatesIndex, setTemplatesIndex] = useState<TemplatesIndex | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [outline, setOutline] = useState<SlideOutline[]>([]);
  const [reviseInstruction, setReviseInstruction] = useState('');

  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((idx) => {
        if (!cancelled) setTemplatesIndex(idx);
      })
      .catch((e) => console.warn('Failed to load templates index', e));
    return () => {
      cancelled = true;
    };
  }, []);

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
      } catch (err) {
        if (cancelled) return;
        setPhase('editing');
        setErrorMessage(err instanceof Error ? err.message : '获取任务状态失败');
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

  const templateEntries: TemplateEntry[] = useMemo(() => {
    if (!templatesIndex) return [];
    const all: TemplateEntry[] = Object.entries(templatesIndex.layouts).map(
      ([id, v]) => ({ ...(v as TemplateEntry), id }),
    );
    if (activeCategory === 'all') return all;
    const ids = templatesIndex.categories[activeCategory]?.layouts ?? [];
    const idSet = new Set(ids);
    return all.filter((t) => idSet.has(t.id));
  }, [templatesIndex, activeCategory]);

  const selectedTemplateLabel =
    selectedTemplateId && templatesIndex?.layouts[selectedTemplateId]?.label;

  const handleDraftOutline = async () => {
    if (phase === 'drafting') return;
    if (!promptText.trim() && !attachedFile) {
      setErrorMessage('请先描述你的需求或上传一份文档。');
      return;
    }
    setErrorMessage(null);
    setPhase('drafting');

    try {
      let pid = projectId;
      if (!pid) {
        const project = await createProject({
          name: 'web_presentation',
          format: 'ppt169',
          slideCount,
        });
        pid = project.project_id;
        setProjectId(pid);
      }

      if (attachedFile) {
        await uploadSource(pid, attachedFile);
      } else if (promptText.trim()) {
        await uploadText(pid, promptText.trim());
      }

      const res = await draftOutline({
        projectId: pid,
        requirements: promptText,
        slideCount,
        autoChart,
        templateId: selectedTemplateId,
      });
      setOutline(res.slides.sort((a, b) => a.id - b.id));
      setPhase('editing');
    } catch (err) {
      setPhase('idle');
      setErrorMessage(err instanceof Error ? err.message : '生成大纲失败');
    }
  };

  const handleReviseOutline = async () => {
    if (!projectId || phase === 'drafting') return;
    if (!reviseInstruction.trim()) {
      setErrorMessage('请告诉 AI 想如何修改当前大纲。');
      return;
    }
    setErrorMessage(null);
    setPhase('drafting');

    try {
      const res = await reviseOutline({
        projectId,
        outline,
        instruction: reviseInstruction,
        autoChart,
        templateId: selectedTemplateId,
      });
      setOutline(res.slides.sort((a, b) => a.id - b.id));
      setReviseInstruction('');
      setPhase('editing');
    } catch (err) {
      setPhase('editing');
      setErrorMessage(err instanceof Error ? err.message : '修改大纲失败');
    }
  };

  const handleStartGeneration = async () => {
    if (!projectId || !outline.length) return;
    setErrorMessage(null);
    setDownloadInfo(null);
    setPhase('generating');
    try {
      const gen = await startGeneration({
        projectId,
        slideCount: outline.length,
        autoChart,
        templateId: selectedTemplateId,
        outline,
      });
      setTaskId(gen.task_id);
    } catch (err) {
      setPhase('editing');
      setErrorMessage(err instanceof Error ? err.message : '启动生成失败');
    }
  };

  const handleDownload = () => {
    if (!projectId || !downloadInfo) return;
    const link = document.createElement('a');
    link.href = getDownloadUrl(downloadInfo.url);
    link.download = downloadInfo.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const patchSlide = (idx: number, patch: Partial<SlideOutline>) => {
    setOutline((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= outline.length) return;
    setOutline((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const deleteSlide = (idx: number) => {
    setOutline((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, id: i + 1 })));
  };

  const duplicateSlide = (idx: number) => {
    setOutline((prev) => {
      const copy = { ...prev[idx] };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const insertAfter = (idx: number) => {
    setOutline((prev) => {
      const blank: SlideOutline = {
        id: idx + 2,
        title: '新的一页',
        description: '',
        layout: 'content',
        points: [],
      };
      const next = [...prev];
      next.splice(idx + 1, 0, blank);
      return next.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const statusText = task?.stage || '等待开始';
  const progressValue = task?.progress ?? 0;
  const canDownload = phase === 'done' && !!downloadInfo;

  return (
    <div className="min-h-screen bg-[#0C0C0C] text-[#E5E5E5] font-sans flex flex-col">
      <header className="h-[64px] border-b border-[#2A2A2A] px-8 flex items-center justify-between bg-[#0C0C0C]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <Presentation className="w-6 h-6 text-[#C5A059]" />
          <span className="font-serif italic text-xl tracking-[1px] text-[#C5A059] uppercase">
            SlideCraft AI
          </span>
        </div>
        <div className="flex items-center gap-6 text-[12px] uppercase tracking-[1.5px] text-[#999]">
          <span>阶段：<span className="text-[#C5A059] ml-1">{phaseLabel(phase)}</span></span>
          {projectId && (
            <span className="font-mono text-[11px]">
              项目 <span className="text-[#C5A059]">{projectId.slice(-8)}</span>
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT: Chat input */}
        <section className="w-[420px] border-r border-[#2A2A2A] flex flex-col bg-[#0C0C0C]">
          <div className="p-8 overflow-y-auto no-scrollbar flex flex-col gap-6 flex-1">
            <div>
              <h1 className="text-[22px] font-light tracking-[-0.5px] mb-1 text-[#E5E5E5] flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#C5A059]" />
                和 AI 聊聊你的 PPT
              </h1>
              <p className="text-[12px] text-[#999] leading-[1.6]">
                描述主题 / 受众 / 风格，可选附上参考文档。AI 先出大纲，你确认后再生成幻灯片。
              </p>
            </div>

            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-[3px] border border-[#5A2525] bg-[#2A1313] px-3 py-2 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-[#F5A3A3] shrink-0 mt-0.5" />
                  <div className="text-[12px] text-[#F5A3A3] leading-[1.5]">{errorMessage}</div>
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="text-[#F5A3A3]/70 hover:text-[#F5A3A3]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {phase === 'editing' || phase === 'drafting' || phase === 'generating' || phase === 'done' ? (
              <div className="rounded-[3px] border border-[#2A2A2A] bg-[#111] px-3 py-2 text-[12px] text-[#999]">
                <div className="text-[11px] uppercase tracking-[0.5px] text-[#C5A059] mb-1">初始需求</div>
                <div className="text-[#CCC] whitespace-pre-wrap leading-[1.6]">{promptText || '（基于上传文档）'}</div>
                {attachedFile && (
                  <div className="mt-2 text-[11px] text-[#777]">
                    附件：<span className="text-[#C5A059]">{attachedFile.name}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[4px] border border-[#2A2A2A] bg-[#111] flex flex-col">
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="例如：帮我做一份面向销售团队的 Q2 业绩复盘，风格简洁数据驱动。"
                  rows={6}
                  className="bg-transparent p-4 text-[13px] text-[#E5E5E5] placeholder-[#555] outline-none resize-none leading-[1.7]"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-[#2A2A2A]">
                  <label className="flex items-center gap-2 text-[12px] text-[#999] hover:text-[#C5A059] cursor-pointer transition-colors">
                    <Paperclip className="w-4 h-4" />
                    {attachedFile ? attachedFile.name : '附加文档'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt,.md,.pptx"
                      onChange={(e) => e.target.files && setAttachedFile(e.target.files[0])}
                    />
                  </label>
                  {attachedFile && (
                    <button
                      onClick={() => setAttachedFile(null)}
                      className="text-[#777] hover:text-[#C5A059]"
                      title="移除附件"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Advanced: slide count / auto chart / template */}
            <div className="rounded-[3px] border border-[#2A2A2A] bg-[#111]">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between text-[12px] text-[#999] hover:text-[#E5E5E5]"
              >
                <span className="uppercase tracking-[0.5px]">高级选项</span>
                {advancedOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-[#2A2A2A] pt-3">
                  <div>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-[#E5E5E5]">预期页数</span>
                      <span className="text-[#C5A059] font-mono">{slideCount}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={slideCount}
                      onChange={(e) => setSlideCount(parseInt(e.target.value, 10))}
                      className="w-full accent-[#C5A059]"
                    />
                  </div>
                  <label className="flex items-center justify-between text-[12px]">
                    <span className="text-[#E5E5E5]">智能图表页</span>
                    <input
                      type="checkbox"
                      checked={autoChart}
                      onChange={(e) => setAutoChart(e.target.checked)}
                      className="accent-[#C5A059]"
                    />
                  </label>
                  <div>
                    <button
                      onClick={() => setTemplatePickerOpen((v) => !v)}
                      className="w-full text-left flex items-center justify-between text-[12px] text-[#E5E5E5] hover:text-[#C5A059]"
                    >
                      <span className="flex items-center gap-2">
                        <LayoutTemplate className="w-4 h-4" />
                        {selectedTemplateLabel ? `模板：${selectedTemplateLabel}` : '选择内置模板（可选）'}
                      </span>
                      {templatePickerOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {templatePickerOpen && templatesIndex && (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          <CategoryBtn
                            active={activeCategory === 'all'}
                            onClick={() => setActiveCategory('all')}
                          >
                            全部
                          </CategoryBtn>
                          {(Object.entries(templatesIndex.categories) as [
                            string,
                            { label: string; layouts: string[] },
                          ][]).map(([key, cat]) => (
                            <CategoryBtn
                              key={key}
                              active={activeCategory === key}
                              onClick={() => setActiveCategory(key)}
                            >
                              {cat.label}
                            </CategoryBtn>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto no-scrollbar">
                          {templateEntries.map((t) => {
                            const sel = selectedTemplateId === t.id;
                            return (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTemplateId(sel ? null : t.id)}
                                className={`text-left rounded-[3px] border overflow-hidden bg-[#161616] transition-all ${
                                  sel
                                    ? 'border-[#C5A059] shadow-[0_0_0_1px_#C5A059]'
                                    : 'border-[#2A2A2A] hover:border-[#555]'
                                }`}
                                title={t.summary}
                              >
                                <div className="aspect-[16/9] bg-[#0C0C0C] border-b border-[#2A2A2A] overflow-hidden">
                                  {t.thumbnail ? (
                                    <img
                                      src={t.thumbnail}
                                      alt={t.label}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center h-full">
                                      <LayoutTemplate className="w-5 h-5 text-[#2A2A2A]" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2">
                                  <div
                                    className={`text-[11px] truncate ${
                                      sel ? 'text-[#C5A059]' : 'text-[#E5E5E5]'
                                    }`}
                                  >
                                    {t.label}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Main action */}
            {phase === 'idle' && (
              <button
                onClick={handleDraftOutline}
                disabled={phase === 'drafting'}
                className="py-3 rounded-[3px] bg-[#C5A059] text-black font-semibold uppercase tracking-[1px] text-[13px] hover:bg-[#D5B069] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                生成大纲
              </button>
            )}

            {phase === 'drafting' && (
              <button
                disabled
                className="py-3 rounded-[3px] bg-[#2A2A2A] text-[#999] uppercase tracking-[1px] text-[13px] flex items-center justify-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {outline.length ? 'AI 正在修改大纲...' : 'AI 正在起草大纲...'}
              </button>
            )}

            {(phase === 'editing' || phase === 'generating' || phase === 'done') && (
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.5px] text-[#C5A059]">
                  <Edit3 className="w-3.5 h-3.5 inline mr-1" />
                  继续对话 / 修改大纲
                </div>
                <textarea
                  value={reviseInstruction}
                  onChange={(e) => setReviseInstruction(e.target.value)}
                  placeholder="例如：第 3 页换成对比页；再补一页讲风险；整体更简洁。"
                  rows={3}
                  className="w-full bg-[#111] border border-[#2A2A2A] rounded-[3px] p-3 text-[12px] text-[#E5E5E5] placeholder-[#555] outline-none resize-none focus:border-[#C5A059]/40"
                />
                <button
                  onClick={handleReviseOutline}
                  disabled={phase !== 'editing' || !reviseInstruction.trim()}
                  className="w-full py-2 rounded-[3px] border border-[#2A2A2A] text-[#E5E5E5] hover:border-[#C5A059] hover:text-[#C5A059] text-[12px] uppercase tracking-[1px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  让 AI 调整
                </button>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: outline editor / progress / preview */}
        <section className="flex-1 bg-[#0C0C0C] relative overflow-hidden flex flex-col">
          <AnimatePresence>
            {phase === 'generating' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#0C0C0C]/85 backdrop-blur-md z-20 flex flex-col items-center justify-center px-8"
              >
                <div className="w-20 h-20 relative mb-6">
                  <div className="absolute inset-0 border-[2px] border-[#2A2A2A] rounded-full" />
                  <div className="absolute inset-0 border-[2px] border-[#C5A059] rounded-full border-t-transparent animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-[#C5A059] animate-pulse" />
                </div>
                <h2 className="text-[22px] font-light text-[#E5E5E5] mb-2">正在生成幻灯片</h2>
                <p className="text-[#999] text-[13px] mb-6">{statusText}</p>
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-[12px] text-[#999] mb-2">
                    <span>{task?.status || 'queued'}</span>
                    <span>{progressValue}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
                    <div
                      className="h-full bg-[#C5A059] transition-all duration-500"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-[#555] gap-4">
              <MessageSquare className="w-14 h-14 text-[#2A2A2A]" />
              <p className="text-[#E5E5E5] text-[15px]">还没有大纲</p>
              <p className="text-[12px]">在左侧描述需求，AI 会先帮你起草一份可编辑的大纲</p>
            </div>
          )}

          {phase === 'drafting' && !outline.length && (
            <div className="flex-1 flex flex-col items-center justify-center text-[#999] gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#C5A059]" />
              <p className="text-[13px]">正在分析你的需求并生成大纲...</p>
            </div>
          )}

          {(phase === 'editing' || phase === 'generating' || phase === 'done') && outline.length > 0 && (
            <div className="flex-1 flex flex-col pt-6 px-8 overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-4">
                <div>
                  <h2 className="text-[20px] font-light text-[#E5E5E5]">
                    大纲预览 <span className="text-[#555] text-[13px]">{outline.length} 页</span>
                  </h2>
                  <p className="text-[12px] text-[#777] mt-1">
                    点击卡片任意字段直接编辑；卡片间拖拽可重排；右上角按钮可移动/复制/删除。
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {phase === 'done' && (
                    <button
                      onClick={handleDownload}
                      disabled={!canDownload}
                      className="px-5 py-2.5 rounded-[3px] bg-[#C5A059] text-black hover:bg-[#D5B069] text-[12px] uppercase tracking-[1px] flex items-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      下载 .pptx
                    </button>
                  )}
                  {phase === 'editing' && (
                    <button
                      onClick={handleStartGeneration}
                      disabled={!outline.length}
                      className="px-6 py-2.5 rounded-[3px] bg-[#C5A059] text-black hover:bg-[#D5B069] text-[12px] uppercase tracking-[1px] flex items-center gap-2 disabled:opacity-50 font-semibold"
                    >
                      <Sparkles className="w-4 h-4" />
                      开始生成 PPT
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pb-12">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {outline.map((slide, idx) => (
                    <EditableSlide
                      key={`${idx}-${slide.id}`}
                      slide={slide}
                      index={idx}
                      total={outline.length}
                      onChange={(patch) => patchSlide(idx, patch)}
                      onDelete={() => deleteSlide(idx)}
                      onDuplicate={() => duplicateSlide(idx)}
                      onMove={(dir) => moveSlide(idx, idx + dir)}
                      onInsertAfter={() => insertAfter(idx)}
                      onDragStart={(e) => {
                        dragIndexRef.current = idx;
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragIndexRef.current;
                        dragIndexRef.current = null;
                        if (from === null || from === idx) return;
                        moveSlide(from, idx);
                      }}
                    />
                  ))}
                </div>

                {phase === 'done' && downloadInfo && (
                  <div className="mt-6 rounded-[3px] border border-[#2A2A2A] bg-[#161616] px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] text-[#E5E5E5]">导出文件已就绪</div>
                      <div className="text-[11px] text-[#777] mt-1">
                        {downloadInfo.filename} · {formatFileSize(downloadInfo.size)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case 'idle':
      return '收集需求';
    case 'drafting':
      return '生成大纲';
    case 'editing':
      return '编辑大纲';
    case 'generating':
      return '渲染幻灯片';
    case 'done':
      return '已完成';
  }
}

function CategoryBtn({
  children,
  active,
  onClick,
}: {
  key?: React.Key;
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[10px] uppercase tracking-[0.5px] rounded-[2px] border transition-colors ${
        active
          ? 'border-[#C5A059] text-[#C5A059] bg-[#1A1A1A]'
          : 'border-[#2A2A2A] text-[#999] hover:text-[#E5E5E5]'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
