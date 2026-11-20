/**
 * Dialog.tsx — 统一弹窗组件
 *
 * 用法：
 *   <Dialog title="创建令牌" open={visible} onClose={() => setVisible(false)} width={480}>
 *     <DialogForm onSubmit={handle} loading={submitting}>
 *       <Field label="名称" required><Input .../></Field>
 *       ...
 *       <DialogActions onCancel={() => setVisible(false)} />
 *     </DialogForm>
 *   </Dialog>
 */
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { modalFooterBtnPrimary, modalFooterBtnSecondary } from '../ui/tableRowActionButtons';

// ─── Dialog Shell ───────────────────────────────────────────────────────────

interface DialogProps {
  title: React.ReactNode;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export function Dialog({ title, open, onClose, width = 480, children }: DialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Dialog Box */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          width, maxWidth: 'calc(100vw - 32px)',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-modal, 0 24px 80px rgba(0,0,0,0.4))',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px 14px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}>
          <h3 style={{
            margin: 0, fontSize: 15, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1,
              padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            &times;
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px 24px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ─── Field: label + input wrapper ───────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  col?: 1 | 2;  // grid span
}

export function Field({ label, required, hint, children, col }: FieldProps) {
  return (
    <div style={{ marginBottom: 16, gridColumn: col === 2 ? 'span 2' : undefined }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'var(--text-secondary)', marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {label}
        {required && <span style={{ color: '#f87171', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && (
        <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Two-column form grid ───────────────────────────────────────────────────

export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols === 2 ? '1fr 1fr' : '1fr',
      gap: '0 16px',
    }}>
      {children}
    </div>
  );
}

// ─── Section divider inside form ───────────────────────────────────────────

export function FormSection({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      paddingBottom: 8, marginBottom: 12, marginTop: 20,
      borderBottom: '1px solid var(--border-default)',
    }}>
      {title}
    </div>
  );
}

// ─── Text Input ─────────────────────────────────────────────────────────────

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
}

export function TextInput({ prefix, style, onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = React.useState(false);

  const inputEl = (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'var(--bg-card)',
        border: `1px solid ${focused ? 'var(--border-hover)' : 'var(--border-default)'}`,
        borderRadius: 7, color: 'var(--text-primary)',
        padding: prefix ? '9px 12px 9px 32px' : '9px 12px',
        fontSize: 13, outline: 'none',
        transition: 'border-color 0.15s',
        ...style,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );

  if (!prefix) return inputEl;

  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-tertiary)', fontSize: 13, pointerEvents: 'none',
      }}>
        {prefix}
      </span>
      {inputEl}
    </div>
  );
}

// ─── Textarea ───────────────────────────────────────────────────────────────

export function TextArea({ style, onFocus, onBlur, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = React.useState(false);
  return (
    <textarea
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', resize: 'vertical',
        background: 'var(--bg-card)',
        border: `1px solid ${focused ? 'var(--border-hover)' : 'var(--border-default)'}`,
        borderRadius: 7, color: 'var(--text-primary)',
        padding: '9px 12px', fontSize: 13, outline: 'none',
        transition: 'border-color 0.15s', fontFamily: 'inherit',
        minHeight: 72,
        ...style,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────

interface SelectOption { label: string; value: string | number; }
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  onChange?: (value: string) => void;
}

export function Select({ options, onChange, style, onFocus, onBlur, ...props }: SelectProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <select
      {...props}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        width: '100%', boxSizing: 'border-box',
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${focused ? 'var(--border-hover)' : 'var(--border-default)'}`,
        borderRadius: 7, color: 'var(--text-primary)',
        padding: '9px 32px 9px 12px', fontSize: 13, outline: 'none',
        cursor: 'pointer', transition: 'border-color 0.15s',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 16 16' fill='%23888'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...style,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Dialog action buttons ───────────────────────────────────────────────────

interface DialogActionsProps {
  onCancel: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  danger?: boolean;
  confirmType?: 'submit' | 'button';
}

export function DialogActions({
  onCancel, onConfirm, confirmText, cancelText,
  loading, danger, confirmType = 'submit',
}: DialogActionsProps) {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
      paddingTop: 16,
      borderTop: '1px solid var(--border-default)',
    }}>
      <Space align="center" size={8}>
        <Button {...modalFooterBtnSecondary} icon={<CloseOutlined />} onClick={onCancel}>
          {cancelText || t('cancel')}
        </Button>
        <Button
          {...modalFooterBtnPrimary}
          danger={danger}
          loading={loading}
          htmlType={confirmType}
          icon={loading ? undefined : <CheckOutlined />}
          onClick={confirmType === 'button' ? onConfirm : undefined}
        >
          {confirmText || t('confirm')}
        </Button>
      </Space>
    </div>
  );
}
