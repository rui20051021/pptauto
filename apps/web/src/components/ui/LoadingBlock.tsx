type LoadingBlockProps = {
  label?: string;
};

export function LoadingBlock({ label = "正在加载..." }: LoadingBlockProps) {
  return (
    <div className="loading-block">
      <span className="loading-dot" />
      <span>{label}</span>
    </div>
  );
}
