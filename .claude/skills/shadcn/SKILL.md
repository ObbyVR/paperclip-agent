---
name: shadcn
description: Use when adding, modifying or composing UI components in Paperclip. Covers shadcn/ui patterns specific to this project (new-york style, neutral base, CSS variables, OKLCH).
risk: safe
---

# shadcn/ui — Paperclip context

Paperclip uses shadcn/ui (new-york, neutral, CSS variables). Components live in `ui/src/components/ui/`.

## Add a component

```bash
pnpm dlx shadcn@latest add <component>
```

## Key rules

- Use `cn()` (`clsx` + `tailwind-merge`) for all className composition — never string concatenation.
- Extend with CVA (`class-variance-authority`) when a component needs variants.
- Colors via CSS variables only (`oklch(…)`) — no hardcoded hex or Tailwind color names.
- Radix UI primitives already included — use them for accessibility (focus, keyboard, aria).
- Icons: Lucide React — 16px in nav, 14px inline.

## Composition pattern

```tsx
import { cn } from "@/lib/utils"

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "muted"
}

export function MyComponent({ className, variant = "default", ...props }: Props) {
  return (
    <div
      className={cn(
        "base-classes",
        variant === "muted" && "muted-classes",
        className
      )}
      {...props}
    />
  )
}
```

## Available components (already installed)

Check `ui/src/components/ui/` for what's there before adding. Use `pnpm dlx shadcn@latest add` only for genuinely missing ones.

## Don't

- Don't install other component libraries.
- Don't override Radix with custom focus/keyboard logic.
- Don't use inline styles.
- Don't add dark/light theme variants manually — use CSS variables.
