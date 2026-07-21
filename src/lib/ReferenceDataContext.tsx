import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

export interface ReferenceValue {
  code: string;
  label: string;
  description?: string;
  sortOrder?: number;
  metadata?: Record<string, any>;
}

interface ReferenceDataState {
  values: (groupCode: string) => ReferenceValue[];
  positionTaxonomy: ReferenceValue[];
}

const ReferenceDataContext = createContext<ReferenceDataState | null>(null);

export function ReferenceDataProvider({ children }: { children: React.ReactNode }) {
  const [bootstrap, setBootstrap] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBootstrap().then(setBootstrap).catch((reason: any) => {
      setError(reason?.message || "Unable to load PostgreSQL reference data.");
    });
  }, []);

  const value = useMemo<ReferenceDataState | null>(() => {
    if (!bootstrap) return null;
    return {
      values: (groupCode: string) => bootstrap.referenceData?.[groupCode] || [],
      positionTaxonomy: bootstrap.positionTaxonomy || [],
    };
  }, [bootstrap]);

  if (error) {
    return <div className="m-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>;
  }
  if (!value) {
    return <div className="m-8 text-sm text-slate-500">Loading PostgreSQL configuration…</div>;
  }
  return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceData() {
  const context = useContext(ReferenceDataContext);
  if (!context) throw new Error("useReferenceData must be used inside ReferenceDataProvider");
  return context;
}
