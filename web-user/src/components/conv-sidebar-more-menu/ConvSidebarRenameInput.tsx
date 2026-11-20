import { Input } from 'antd';
import type { InputRef } from 'antd';
import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface ConvSidebarRenameInputProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export const ConvSidebarRenameInput = forwardRef<InputRef, ConvSidebarRenameInputProps>(
  function ConvSidebarRenameInput({ value, onChange, onCommit, onCancel }, ref) {
    const inputRef = useRef<InputRef>(null);
    useImperativeHandle(ref, () => inputRef.current as InputRef);

    return (
      <Input
        ref={inputRef}
        classNames={{
          input: 'sidebar-rename-input',
          affixWrapper: 'sidebar-rename-input-affix',
        }}
        styles={{
          affixWrapper: {
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            margin: 0,
            minHeight: 'unset',
          },
          input: {
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            margin: 0,
          },
        }}
        variant="borderless"
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCommit}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  },
);
