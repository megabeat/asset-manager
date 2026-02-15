import { ReactNode } from 'react';

type FormFieldProps = {
  label: string;
  error?: string;
  fullWidth?: boolean;
  children: ReactNode;
};

export function FormField({ label, error, fullWidth = false, children }: FormFieldProps) {
  return (
    <label style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
      <span className="helper-text">{label}</span>
      {children}
      {error ? <div className="error-text">{error}</div> : null}
    </label>
  );
}
