import type { Artifact } from "../../types";
import { assetUrl } from "../../lib/api";
import { translateArtifactType } from "../../lib/display";
import { formatDateTime, formatFileSize } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

type ArtifactPanelProps = {
  token: string;
  artifacts: Artifact[];
};

export function ArtifactPanel({ token, artifacts }: ArtifactPanelProps) {
  const groups = artifacts.reduce<Record<string, Artifact[]>>((accumulator, artifact) => {
    const key = artifact.artifact_type;
    accumulator[key] = accumulator[key] ? [...accumulator[key], artifact] : [artifact];
    return accumulator;
  }, {});
  const priority = ["pptx", "pptx_snapshot", "design_spec", "notes", "slide_svg", "generated_image"];
  const sortedGroups = Object.entries(groups).sort(([left], [right]) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });

  return (
    <Card eyebrow="导出" title="产物与下载">
      <div className="panel-stack">
        {artifacts.length ? (
          sortedGroups.map(([artifactType, items]) => (
            <div key={artifactType} className="artifact-group">
              <div className="artifact-group-header">
                <strong>{translateArtifactType(artifactType)}</strong>
                <span>{items.length} 个文件</span>
              </div>
              <div className="artifact-grid">
                {items.map((artifact) => (
                  <a
                    key={artifact.id}
                    className="artifact-card"
                    href={assetUrl(artifact.download_url, token)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{artifact.filename}</strong>
                    <span>{formatFileSize(artifact.size_bytes)}</span>
                    <span>{formatDateTime(artifact.created_at)}</span>
                  </a>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="还没有导出文件" description="生成完成后，PPT、SVG、设计规范等文件会显示在这里。" />
        )}
      </div>
    </Card>
  );
}
