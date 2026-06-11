import { useAppStore } from "../../stores/appStore";

import { useTranslation } from "../../hooks/useTranslation";



export function ErrorBanner() {

  const { lastError, setLastError } = useAppStore();

  const { t } = useTranslation();

  if (!lastError) return null;



  return (

    <div className="flex items-center justify-between bg-red-100 px-3 py-2 text-sm text-red-800">

      <span>

        {t("inputError")} {lastError}

      </span>

      <button type="button" className="font-bold" onClick={() => setLastError(null)}>

        {t("dismiss")}

      </button>

    </div>

  );

}

