import type { JSX } from "react";
import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";

export function LoadingOverlay({ message, percent }: { message: string; percent: number }): JSX.Element {
  return (
    <motion.div className="loading-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="loading-card" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}>
        <LoaderCircle className="spin" size={22} />
        <div>
          <strong>{message}</strong>
          <span>{percent}%</span>
        </div>
        <div className="loading-bar">
          <div className="loading-bar__fill" style={{ width: `${percent}%` }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
