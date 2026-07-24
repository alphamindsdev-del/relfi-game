import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Coins } from "lucide-react";
import { useEffect } from "react";

export function TokenCounter({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: [0.2, 0.9, 0.3, 1] });
    return () => controls.stop();
  }, [value, mv]);
  const sizes = {
    sm: "text-sm gap-1 px-2 py-1",
    md: "text-base gap-1.5 px-3 py-1.5",
    lg: "text-2xl gap-2 px-4 py-2 font-display",
  }[size];
  return (
    <div className={`inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] font-semibold tabular-nums ${sizes}`}>
      <Coins className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} style={{ color: "var(--primary-glow)" }} />
      <motion.span>{rounded}</motion.span>
    </div>
  );
}
