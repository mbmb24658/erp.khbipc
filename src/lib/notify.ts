"use client";
import { toast } from "sonner";

export function notifySuccess(msg: string) {
  toast.success(msg);
}
export function notifyError(msg: string) {
  toast.error(msg);
}
export function notifyInfo(msg: string) {
  toast.info(msg);
}
