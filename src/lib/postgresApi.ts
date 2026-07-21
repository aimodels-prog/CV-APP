const API_BASE =
  String(import.meta.env.VITE_POSTGRES_API_BASE || "/api/v2").replace(
    /\/+$/,
    "",
  );

class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiRequestError(
      response.status,
      error?.message || `Request failed with HTTP ${response.status}.`,
      error?.code,
    );
  }
  return body as T;
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const setting = await request<{ value: T }>(
      `/settings/${encodeURIComponent(key)}`,
    );
    return setting.value ?? fallback;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return fallback;
    throw error;
  }
}

async function saveSetting(key: string, value: unknown) {
  return request(`/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value, isSecret: false }),
  });
}

export const postgresMigrationApi = {
  health: () => request("/health"),
  preview: (snapshot: unknown) =>
    request("/migration/browser-data/preview", {
      method: "POST",
      body: JSON.stringify({ snapshot }),
    }),
  import: (snapshot: unknown) =>
    request("/migration/browser-data/import", {
      method: "POST",
      body: JSON.stringify({ snapshot }),
    }),
};

export const postgresApi = {
  health: () => request("/health"),
  getBootstrap: () => request<any>("/bootstrap"),
  getReferenceData: async (groupCode: string) => {
    const group = await request<any>(
      `/reference-data/${encodeURIComponent(groupCode)}`,
    );
    return group.values || [];
  },
  getAppSetting: <T>(key: string, fallback: T) => getSetting(key, fallback),
  saveAppSetting: (key: string, value: unknown) => saveSetting(key, value),
  getBrandings: () => request<any[]>("/brandings"),
  createBranding: (branding: any) =>
    request("/brandings", {
      method: "POST",
      body: JSON.stringify(branding),
    }),
  updateBranding: (id: string, updates: any) =>
    request(`/brandings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  deleteBranding: async (id: string) => {
    await request(`/brandings/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  },

  getStats: () => request("/stats"),
  getLogs: () => request<any[]>("/activity-logs"),
  getUsers: () => request<any[]>("/users"),
  addUser: async (user: any) => {
    const created = await request("/users", {
      method: "POST",
      body: JSON.stringify(user),
    });
    return { success: true, user: created };
  },
  updateUser: async (id: string, updates: any) => {
    await request(`/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return { success: true };
  },
  deleteUser: async (id: string) =>
    request(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getExperts: () => request<any[]>("/experts"),
  getTenders: () => request<any[]>("/tenders"),
  getTender: async (id: string) => {
    try {
      return await request(`/tenders/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return undefined;
      throw error;
    }
  },
  updateExpertRole: async (expertId: string, role: string) => {
    await request(`/experts/${encodeURIComponent(expertId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
  updateExpert: async (id: string, updates: any) => {
    await request(`/experts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return { success: true };
  },
  saveExperts: (experts: any[]) =>
    request("/experts/bulk", {
      method: "POST",
      body: JSON.stringify({ experts }),
    }),
  saveTender: (tender: any) =>
    request("/tenders", {
      method: "POST",
      body: JSON.stringify(tender),
    }),
  updateTender: (id: string, updates: any) =>
    request(`/tenders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  updateTenderBranding: async (id: string, branding: any) => {
    await request(`/tenders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ branding }),
    });
    return { success: true };
  },
  updateTenderRepresentativeSettings: async (id: string, settings: any) => {
    await request(`/tenders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ representativeSignatureSettings: settings }),
    });
    return { success: true };
  },
  updateTenderRequirements: async (id: string, requirements: any) => {
    await request(`/tenders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ requirements }),
    });
    return { success: true };
  },

  getMatches: (tenderId?: string) =>
    request<any[]>(
      `/matches${tenderId ? `?tenderId=${encodeURIComponent(tenderId)}` : ""}`,
    ),
  saveMatches: (
    tenderId: string,
    positionId: string,
    positionTitle: string,
    matches: any[],
  ) =>
    request("/matches/bulk", {
      method: "POST",
      body: JSON.stringify({
        tenderId,
        positionId,
        positionTitle,
        matches,
      }),
    }),
  saveCV: async (cv: any) => {
    const created = await request("/generated-cvs", {
      method: "POST",
      body: JSON.stringify(cv),
    });
    return { success: true, cv: created };
  },
  updateCV: async (cv: any) => {
    await request(`/generated-cvs/${encodeURIComponent(cv.id)}`, {
      method: "PATCH",
      body: JSON.stringify(cv),
    });
    return { success: true };
  },
  getCVs: () => request<any[]>("/generated-cvs"),

  getGoogleDriveSettings: () =>
    getSetting("google-drive", {
      folderId: "",
      apiKey: "",
      processedIds: [],
    }),
  saveGoogleDriveSettings: (settings: any) =>
    saveSetting("google-drive", settings),
  getTaxonomy: async () => {
    const rows = await request<any[]>("/taxonomy");
    return rows.map((row) => row.label);
  },
  saveTaxonomy: async (taxonomy: string[]) => {
    const existing = await request<any[]>("/taxonomy?includeInactive=true");
    const wanted = new Set(taxonomy.map((label) => label.trim().toLowerCase()));
    for (const row of existing) {
      const shouldBeActive = wanted.has(String(row.label).toLowerCase());
      if (Boolean(row.is_active) !== shouldBeActive) {
        await request(`/taxonomy/${encodeURIComponent(row.code)}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: shouldBeActive }),
        });
      }
    }
    for (const label of taxonomy) {
      if (
        existing.some(
          (row) =>
            String(row.label).trim().toLowerCase() === label.trim().toLowerCase(),
        )
      ) {
        continue;
      }
      await request("/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          label,
          categoryLabel: "Custom",
        }),
      });
    }
    return { success: true };
  },
  getAISettings: () => getSetting("ai-settings", { apiKey: "" }),
  saveAISettings: (settings: any) => saveSetting("ai-settings", settings),

  deleteExpert: (id: string) =>
    request(`/experts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteTender: (id: string) =>
    request(`/tenders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteCV: (id: string) =>
    request(`/generated-cvs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteMatch: (id: string) =>
    request(`/matches/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateMatch: async (id: string, updates: any) => {
    await request(`/matches/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return { success: true };
  },

  clearData: async () => {
    throw new Error(
      "PostgreSQL data cannot be cleared from the browser. Use an authorized server-side maintenance operation.",
    );
  },
};
