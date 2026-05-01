import * as React from "react";

import { cn } from "@/lib/utils";

// <Input /> — champ texte standard Ankora.
// Hauteur 44px par defaut (touch-friendly mobile), border soft, focus ring indigo.
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-ankora-border bg-white px-4 py-2 text-sm text-ankora-text placeholder:text-ankora-text-muted",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
