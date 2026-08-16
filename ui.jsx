/* مكوّنات واجهة مشتركة لنقطة البيع */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Inbox } from 'lucide-react';

export const cls = (...a) => a.filter(Boolean).join(' ');

/* نافذة منبثقة (Portal + قفل التمرير + إغلاق بـ Escape) */
export function Modal({ title, sub, icon: Icon, children, foot, onClose, wide }) {
  useEffect(() => {
    const b = document.body, prev = b.style.overflow;
    b.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { b.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return createPortal(
    <div className="mask" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className={cls('modal', wide && 'wide')}>
        <div className="modal-h">
          <div className="modal-h-t">
            <div className="card-t">{Icon && <Icon size={17} color="var(--acc)" />}{title}</div>
            {sub && <div className="modal-h-s">{sub}</div>}
          </div>
          <button className="btn sm gh icon" onClick={onClose} aria-label="إغلاق"><X size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {foot && <div className="modal-f">{foot}</div>}
      </div>
    </div>, document.body);
}

export function Field({ label, children, style }) {
  return <div className="fld" style={style}><label className="lbl">{label}</label>{children}</div>;
}

/* شريط مقسّم للاختيار الأحادي */
export function Seg({ value, onChange, options, pill }) {
  return (
    <div className={cls('seg', pill && 'pill')}>
      {options.map((o) => (
        <button key={o.value} className={cls('seg-b', value === o.value && 'on')}
          onClick={() => onChange(o.value)} type="button">
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="kpi" style={color ? { '--acc': color } : undefined}>
      <div className="kpi-l">{Icon && <Icon size={14} />}{label}</div>
      <div className="kpi-v num">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, hint, children }) {
  return (
    <div className="empty">
      <Icon size={40} />
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--dim)' }}>{title}</div>
      {hint && <div className="sm-txt">{hint}</div>}
      {children}
    </div>
  );
}

/* عدّاد الكمية */
export function Stepper({ value, onDec, onInc, min = 0 }) {
  return (
    <div className="stepper">
      <button onClick={onDec} disabled={value <= min} aria-label="إنقاص"><Minus size={14} /></button>
      <span className="q num">{value}</span>
      <button onClick={onInc} aria-label="زيادة"><Plus size={14} /></button>
    </div>
  );
}

/* حاوية الإشعارات (Toasts) */
export function Toasts({ items }) {
  return createPortal(
    <div className="toast-wrap">
      {items.map((t) => <div key={t.id} className={cls('toast', t.kind)}>{t.icon}{t.msg}</div>)}
    </div>, document.body);
}
