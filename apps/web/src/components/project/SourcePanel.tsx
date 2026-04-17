import { useRef, useState } from "react";
import { translateSourceType } from "../../lib/display";
import type { AsyncFeedback, ProjectSource } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

type SourcePanelProps = {
  sources: ProjectSource[];
  feedback: AsyncFeedback;
  onUpload: (urls: string, files: FileList | null) => Promise<boolean>;
};

export function SourcePanel({ sources, feedback, onUpload }: SourcePanelProps) {
  const [urls, setUrls] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isUploading = feedback.status === "loading";

  async function handleUpload() {
    const success = await onUpload(urls, files);
    if (success) {
      setUrls("");
      setFiles(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <Card eyebrow="素材" title="导入素材">
      <div className="panel-stack">
        <p className="section-copy">上传 Markdown、文档，或直接添加网页链接。素材是可选增强项；如果只想按文字要求直接生成，也可以不上传。</p>
        <textarea
          rows={4}
          placeholder="https://example.com/report&#10;https://example.com/notes"
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
        />
        <input ref={fileInputRef} type="file" multiple onChange={(event) => setFiles(event.target.files)} />
        {files?.length ? (
          <div className="file-list">
            {Array.from(files).map((file) => (
              <span className="file-chip" key={`${file.name}-${file.size}`}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
        <div className="inline-actions">
          <Button onClick={handleUpload} isLoading={isUploading} loadingLabel="正在上传..." disabled={!urls.trim() && !files?.length}>
            上传素材
          </Button>
          {feedback.message ? (
            <p className={`feedback feedback-${feedback.status === "error" ? "error" : "success"}`}>{feedback.message}</p>
          ) : null}
        </div>

        {sources.length ? (
          <div className="token-list">
            {sources.map((source) => (
              <div className="token-item" key={source.id}>
                <strong>{source.original_name}</strong>
                <span>{source.source_type === "url" ? source.source_url : translateSourceType(source.source_type)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="还没有素材" description="可以先上传文件或链接，也可以直接在上面的快捷生成框里写要求。" />
        )}
      </div>
    </Card>
  );
}
