import { useEffect, useRef } from "react";

export function ConfirmDialog({ message, onCancel, onConfirm }: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="confirm-dialog card" aria-labelledby="confirm-title"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="confirm-title">确认操作</h2>
    <p>{message}</p>
    <div className="row">
      <button type="button" className="btn btn-ghost" autoFocus onClick={onCancel}>取消</button>
      <button type="button" className="btn btn-primary" onClick={onConfirm}>确认</button>
    </div>
  </dialog>;
}
