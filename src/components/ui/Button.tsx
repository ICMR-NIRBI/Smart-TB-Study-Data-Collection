import React from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'ghost';
type Size = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-lock-300 disabled:text-white',
  secondary: 'border border-line-strong bg-white text-ink hover:bg-canvas disabled:text-ink-muted',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:bg-lock-300',
  'danger-outline': 'border border-danger-200 bg-white text-danger-700 hover:bg-danger-50 disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-canvas disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-[48px] px-4 text-[15px]',
  sm: 'min-h-[44px] px-3 text-sm',
};

export function Button({ variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
