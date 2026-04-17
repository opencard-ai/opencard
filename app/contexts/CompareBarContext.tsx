"use client";

import { createContext, useContext, useState, useEffect } from "react";

const CompareBarContext = createContext(false);

export function CompareBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      document.body.classList.add("compare-bar-visible");
    };
    const hide = () => {
      setVisible(false);
      document.body.classList.remove("compare-bar-visible");
    };

    window.addEventListener("comparebar:show", show);
    window.addEventListener("comparebar:hide", hide);

    return () => {
      window.removeEventListener("comparebar:show", show);
      window.removeEventListener("comparebar:hide", hide);
    };
  }, []);

  return (
    <CompareBarContext.Provider value={visible}>
      {children}
    </CompareBarContext.Provider>
  );
}

export function useCompareBarVisible() {
  return useContext(CompareBarContext);
}
