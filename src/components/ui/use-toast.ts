// Just use sonner natively, but provide standard toast signature
import { toast as sonnerToast } from "sonner"

export const toast = sonnerToast

export function useToast() {
  return { toast }
}
