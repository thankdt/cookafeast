import type { RecipeStep } from '@cookafeast/core';

/** Hiển thị hướng dẫn chi tiết của một bước nấu (guidance, mẹo, dấu hiệu đạt, lỗi hay gặp). */
export function StepGuide({ step }: { step: RecipeStep }) {
  const hasDetail =
    step.guidance || step.tips?.length || step.doneSigns?.length || step.commonMistakes?.length;
  if (!hasDetail) return null;
  return (
    <div className="step-guide">
      {step.guidance && <p className="guide-body">{step.guidance}</p>}
      {step.doneSigns && step.doneSigns.length > 0 && (
        <div className="guide-block ok">
          <div className="guide-label">✓ Đạt khi</div>
          <ul>{step.doneSigns.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {step.tips && step.tips.length > 0 && (
        <div className="guide-block tip">
          <div className="guide-label">💡 Mẹo</div>
          <ul>{step.tips.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {step.commonMistakes && step.commonMistakes.length > 0 && (
        <div className="guide-block warn">
          <div className="guide-label">⚠️ Tránh</div>
          <ul>{step.commonMistakes.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
