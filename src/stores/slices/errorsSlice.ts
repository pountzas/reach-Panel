import type { StateCreator } from "zustand";
import type { AppStore, ErrorsSlice } from "../types";
import { storeFlags } from "../storeFlags";

import { notify } from "../../lib/notify";
import { isStickySpeechError } from "../../lib/speechPrivacy";

export const createErrorsSlice: StateCreator<AppStore, [], [], ErrorsSlice> = (
  set,
) => ({
  lastError: null,
  setLastError: (error) => {
    if (!error) {
      storeFlags.lastAnnouncedError = null;
      set({ lastError: null });
      return;
    }
    // Sticky overlay for actionable speech errors; everything else → toast.
    if (isStickySpeechError(error)) {
      storeFlags.lastAnnouncedError = error;
      set({ lastError: error });
      return;
    }
    if (storeFlags.lastAnnouncedError === error) {
      return;
    }
    storeFlags.lastAnnouncedError = error;
    notify.error(error);
    set({ lastError: null });
  },
});
