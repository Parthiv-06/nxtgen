// shadcn's class-name helper: joins conditional classes and resolves Tailwind conflicts.
// Components added with the shadcn CLI import it from "@/lib/utils".
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
