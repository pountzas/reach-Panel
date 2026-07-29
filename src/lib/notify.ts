import toast, { type ToastOptions } from "react-hot-toast";

const SUCCESS_DURATION_MS = 2500;
const ERROR_DURATION_MS = 5000;
const INFO_DURATION_MS = 3000;

export const notify = {
  success(message: string) {
    toast.success(message, { duration: SUCCESS_DURATION_MS });
  },
  error(message: string, options?: ToastOptions) {
    toast.error(message, { duration: ERROR_DURATION_MS, ...options });
  },
  info(message: string) {
    toast(message, { duration: INFO_DURATION_MS });
  },
};
