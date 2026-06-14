import type { RecipeStep } from '@cookafeast/core';
import { StepGuide } from './StepGuide.tsx';

/** Modal bung hướng dẫn chi tiết một bước khi đang nấu (Cook Mode). */
export function CookModeGuide({
  step,
  dishName,
  onClose,
}: {
  step: RecipeStep;
  dishName: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grip" />
        <p className="kicker">{dishName}</p>
        <h2>{step.emoji ? `${step.emoji} ` : ''}{step.text}</h2>
        <p className="muted small">
          {step.activeMin > 0 && `~${step.activeMin} phút làm`}
          {step.passiveMin > 0 && ` · ${step.passiveMin} phút chờ`}
        </p>
        <StepGuide step={step} />
        {!step.guidance && !step.tips?.length && !step.doneSigns?.length && (
          <p className="muted">Bước này làm theo mô tả ở trên là được.</p>
        )}
        <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>Đã hiểu</button>
      </div>
    </div>
  );
}
