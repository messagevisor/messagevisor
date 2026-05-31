import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-full border border-border bg-surface px-5 py-2 text-xl text-text outline-none placeholder:text-placeholder focus:border-primary ${className}`}
      {...props}
    />
  );
}
