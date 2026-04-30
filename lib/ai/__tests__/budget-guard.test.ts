import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Supabase admin client AVANT d'importer le module a tester
const mockData: { cost_eur: number }[] = [];
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      gte: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
    })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockSupabase,
}));

// Mock fetch global pour Resend
const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("ok") })
);
vi.stubGlobal("fetch", mockFetch);

import {
  getBudgetStatus,
  ensureBudgetAvailable,
  BudgetExceededError,
  checkAndAlertThresholds,
  getMonthToDateSpend,
} from "../budget-guard";

beforeEach(() => {
  mockData.length = 0;
  mockFetch.mockClear();
  // Reset env vars
  process.env.MONTHLY_API_BUDGET_EUR = "90";
  process.env.BUDGET_WARNING_THRESHOLD_EUR = "70";
  process.env.BUDGET_CRITICAL_THRESHOLD_EUR = "85";
  process.env.RESEND_API_KEY = "test-key";
  process.env.ADMIN_EMAIL = "test@example.com";
});

describe("budget-guard", () => {
  describe("getMonthToDateSpend", () => {
    it("retourne 0 si aucun usage", async () => {
      mockData.length = 0;
      expect(await getMonthToDateSpend()).toBe(0);
    });

    it("somme les couts cumules de tous les providers", async () => {
      mockData.push(
        { cost_eur: 0.3 }, // openai
        { cost_eur: 0.5 }, // anthropic
        { cost_eur: 0.4 }, // perplexity
        { cost_eur: 0.1 } // gemini
      );
      expect(await getMonthToDateSpend()).toBeCloseTo(1.3, 6);
    });
  });

  describe("getBudgetStatus", () => {
    it("alerte 'ok' quand depense < warning", async () => {
      mockData.push({ cost_eur: 50 });
      const status = await getBudgetStatus();
      expect(status.alert_level).toBe("ok");
      expect(status.can_run_audit).toBe(true);
    });

    it("alerte 'warning' a 70€", async () => {
      mockData.push({ cost_eur: 70.5 });
      const status = await getBudgetStatus();
      expect(status.alert_level).toBe("warning");
      expect(status.can_run_audit).toBe(true);
    });

    it("alerte 'critical' a 85€", async () => {
      mockData.push({ cost_eur: 85.5 });
      const status = await getBudgetStatus();
      expect(status.alert_level).toBe("critical");
      // 85.5 + 1.20 = 86.70 → encore < 90, peut lancer
      expect(status.can_run_audit).toBe(true);
    });

    it("alerte 'critical' + can_run_audit=false a 89€ (projection > 90)", async () => {
      mockData.push({ cost_eur: 89 });
      const status = await getBudgetStatus();
      expect(status.alert_level).toBe("critical");
      // 89 + 1.20 = 90.20 → DEPASSE le cap → refuse
      expect(status.can_run_audit).toBe(false);
    });

    it("alerte 'blocked' a 90€+", async () => {
      mockData.push({ cost_eur: 90.5 });
      const status = await getBudgetStatus();
      expect(status.alert_level).toBe("blocked");
      expect(status.can_run_audit).toBe(false);
    });

    it("calcule le restant correctement", async () => {
      mockData.push({ cost_eur: 30 });
      const status = await getBudgetStatus();
      expect(status.remaining_eur).toBeCloseTo(60, 6);
    });
  });

  describe("ensureBudgetAvailable", () => {
    it("passe quand budget OK", async () => {
      mockData.push({ cost_eur: 50 });
      const status = await ensureBudgetAvailable();
      expect(status.alert_level).toBe("ok");
    });

    it("throw BudgetExceededError quand projection depasse cap", async () => {
      mockData.push({ cost_eur: 89.5 });
      await expect(ensureBudgetAvailable()).rejects.toThrow(BudgetExceededError);
    });

    it("throw quand deja au-dessus du cap", async () => {
      mockData.push({ cost_eur: 91 });
      await expect(ensureBudgetAvailable()).rejects.toThrow(/Budget mensuel atteint/);
    });
  });

  describe("checkAndAlertThresholds", () => {
    it("envoie un email warning au franchissement de 70€", async () => {
      const result = await checkAndAlertThresholds({
        total_before_eur: 69,
        total_after_eur: 71,
      });
      expect(result.alertSent).toBe("warning");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as unknown as [string, { body: string }];
      expect(call[0]).toBe("https://api.resend.com/emails");
      const body = JSON.parse(call[1].body);
      expect(body.subject).toContain("Avertissement budget");
    });

    it("envoie un email critical au franchissement de 85€", async () => {
      const result = await checkAndAlertThresholds({
        total_before_eur: 84,
        total_after_eur: 86,
      });
      expect(result.alertSent).toBe("critical");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as unknown as [string, { body: string }];
      const body = JSON.parse(call[1].body);
      expect(body.subject).toContain("CRITIQUE");
    });

    it("priorite critical sur warning si on saute 70 et 85 d'un coup", async () => {
      const result = await checkAndAlertThresholds({
        total_before_eur: 69,
        total_after_eur: 86,
      });
      expect(result.alertSent).toBe("critical");
      // Un seul email envoye (le critical), pas deux
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("aucun email si on n'a pas franchi de seuil", async () => {
      const result = await checkAndAlertThresholds({
        total_before_eur: 50,
        total_after_eur: 51,
      });
      expect(result.alertSent).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("aucun email si on etait deja au-dessus du seuil avant l'appel", async () => {
      const result = await checkAndAlertThresholds({
        total_before_eur: 71,
        total_after_eur: 72,
      });
      expect(result.alertSent).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("ne crash pas si RESEND_API_KEY absent", async () => {
      delete process.env.RESEND_API_KEY;
      const result = await checkAndAlertThresholds({
        total_before_eur: 69,
        total_after_eur: 71,
      });
      expect(result.alertSent).toBe("warning");
      // Pas de fetch tente
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Cap configurable via env vars", () => {
    it("respecte un cap personnalise via MONTHLY_API_BUDGET_EUR", async () => {
      process.env.MONTHLY_API_BUDGET_EUR = "50";
      mockData.push({ cost_eur: 49 });
      const status = await getBudgetStatus();
      // 49 + 1.20 = 50.20 → depasse le cap a 50
      expect(status.can_run_audit).toBe(false);
    });
  });
});
