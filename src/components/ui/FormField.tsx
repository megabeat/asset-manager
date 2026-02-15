import { ReactNode } from 'react';

type FormFieldProps = {
  label: string;
  error?: string;
  fullWidth?: boolean;
  children: ReactNode;
};

export function FormField({ label, error, fullWidth = false, children }: FormFieldProps) {
  return (
    <label className={`form-field${fullWidth ? ' form-field-full' : ''}`}>
      <span className="helper-text">{label}</span>
      {children}
      {error ? <div className="form-error">{error}</div> : null}
    </label>
  );
}
