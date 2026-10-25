/** "Semestre 2" with two periods, "Trimestre 2" with three, else "Période 2" (key under `grading.periods.name`). */
export function periodNameKey(count: number): "semester" | "trimester" | "period" {
  if (count === 2) return "semester";
  if (count === 3) return "trimester";
  return "period";
}
