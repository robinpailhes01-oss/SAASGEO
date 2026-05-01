"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// =====================================================================
// <Button /> — primitive shadcn etendue avec variants Ankora.
//
// Variants principales :
//   - default   : indigo profond (CTA secondaires, formulaires)
//   - gradient  : degrade signature indigo->violet->rose (CTA hero / Calendly)
//   - secondary : lavande clair, sur cards
//   - outline   : contour border-soft, fond transparent
//   - ghost     : transparent, hover discret
//   - destructive : actions dangereuses (rare en V0)
//   - link      : style hyperlien
// =====================================================================
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-ankora-soft hover:bg-ankora-ink-hover hover:shadow-ankora-card",
        gradient:
          "bg-ankora-gradient text-white shadow-ankora-card hover:shadow-ankora-elevated hover:-translate-y-0.5 active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "border border-ankora-border bg-white text-ankora-text hover:bg-secondary hover:text-primary",
        ghost:
          "text-ankora-text hover:bg-secondary hover:text-primary",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-4 text-sm",
        lg: "h-12 rounded-xl px-7 text-base",
        xl: "h-14 rounded-2xl px-8 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  // Permet de composer avec un <Link> ou un autre tag (pattern shadcn)
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
