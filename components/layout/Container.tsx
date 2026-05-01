import * as React from "react";

import { cn } from "@/lib/utils";

// <Container /> — wrapper responsive standardise.
// Largeur max alignee sur le container Tailwind (1400px en 2xl) avec
// padding mobile-first (1.5rem) et confort vertical decoulant des pages.
//
// Variants `size` :
//   - default : 1400px (landing, rapport)
//   - narrow  : 880px  (form / progression — focus visuel)
//   - prose   : 720px  (texte long / pages legales)
type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: "default" | "narrow" | "prose";
};

export function Container({
  className,
  size = "default",
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-6",
        size === "default" && "max-w-[1400px]",
        size === "narrow" && "max-w-[880px]",
        size === "prose" && "max-w-[720px]",
        className
      )}
      {...props}
    />
  );
}
