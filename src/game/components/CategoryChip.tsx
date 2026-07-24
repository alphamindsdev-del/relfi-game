import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "../lib/types";

export function CategoryChip({
  category,
  selected,
  disabled,
  onClick,
  size = "md",
  showLabel = true,
}: {
  category: Category;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const Icon = (Icons as any)[category.icon] ?? Icons.Circle;
  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2.5 text-sm gap-2",
    lg: "px-5 py-3.5 text-base gap-2.5",
  }[size];
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border font-medium transition-colors",
        sizes,
        selected
          ? "text-white"
          : "text-foreground hover:bg-[color-mix(in_oklab,var(--card)_60%,transparent)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      style={{
        borderColor: selected ? category.color : `color-mix(in oklab, ${category.color} 40%, transparent)`,
        background: selected
          ? `linear-gradient(135deg, ${category.color}, color-mix(in oklab, ${category.color} 70%, black))`
          : `color-mix(in oklab, ${category.color} 12%, transparent)`,
        boxShadow: selected ? `0 8px 24px -8px ${category.color}` : undefined,
      }}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
      {showLabel && <span>{category.name}</span>}
    </motion.button>
  );
}
