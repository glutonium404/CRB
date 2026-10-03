/**
 * In-memory session manager for handling multi-turn interactions
 * (such as draft confirmations and step-by-step wizards).
 */
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.TTL_MS = 10 * 60 * 1000; // 10 minutes session expiry
  }

  setDraft(userId, draftData) {
    this.sessions.set(userId, {
      type: 'draft_confirmation',
      data: draftData,
      createdAt: Date.now()
    });
  }

  setWizard(userId, step, wizardData) {
    this.sessions.set(userId, {
      type: 'wizard',
      step,
      data: wizardData,
      createdAt: Date.now()
    });
  }

  getSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;

    if (Date.now() - session.createdAt > this.TTL_MS) {
      this.sessions.delete(userId);
      return null;
    }

    return session;
  }

  clearSession(userId) {
    this.sessions.delete(userId);
  }
}

export const sessionManager = new SessionManager();
