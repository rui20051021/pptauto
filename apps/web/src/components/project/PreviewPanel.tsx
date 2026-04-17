import { useEffect, useMemo, useState } from "react";
import type { Slide } from "../../types";
import { assetUrl } from "../../lib/api";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

type PreviewPanelProps = {
  token: string;
  slides: Slide[];
};

export function PreviewPanel({ token, slides }: PreviewPanelProps) {
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);

  useEffect(() => {
    if (!slides.length) {
      setSelectedSlideId(null);
      return;
    }

    if (!selectedSlideId || !slides.some((slide) => slide.id === selectedSlideId)) {
      setSelectedSlideId(slides[0].id);
    }
  }, [selectedSlideId, slides]);

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) || slides[0] || null,
    [selectedSlideId, slides]
  );

  return (
    <Card
      eyebrow="预览"
      title="页面预览"
      actions={
        selectedSlide ? (
          <a className="utility-link" href={assetUrl(selectedSlide.preview_url, token)} target="_blank" rel="noreferrer">
            打开 SVG
          </a>
        ) : undefined
      }
    >
      <div className="panel-stack">
        {selectedSlide ? (
          <>
            <div className="preview-stage">
              <object data={assetUrl(selectedSlide.preview_url, token)} type="image/svg+xml" className="slide-object" />
            </div>
            <div className="preview-meta">
              <div>
                <strong>
                  第 {selectedSlide.page_number} 页：{selectedSlide.title}
                </strong>
                <p className="muted">下载 PPT 之前，可以先检查生成后的 SVG 页面内容。</p>
              </div>
              <div className="preview-meta-side">
                <span className="meta-chip">共 {slides.length} 页</span>
                {selectedSlide.notes_storage_key ? <span className="meta-chip">备注已生成</span> : null}
              </div>
            </div>
            <div className="thumbnail-grid">
              {slides.map((slide) => (
                <button
                  type="button"
                  key={slide.id}
                  className={`thumb-card ${slide.id === selectedSlide.id ? "thumb-card-active" : ""}`}
                  onClick={() => setSelectedSlideId(slide.id)}
                >
                  <span>第 {slide.page_number} 页</span>
                  <strong>{slide.title}</strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="还没有页面" description="任务完成后，生成的页面会显示在这里。" />
        )}
      </div>
    </Card>
  );
}
