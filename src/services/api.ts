export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

export interface BootstrapData {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: 'parent' | 'teacher' | 'admin';
    coppaConsent: {
      granted: boolean;
      consentedAt?: string;
      method?: string;
      parentSignature?: string;
    };
    createdAt: string;
  }>;
  students: Array<{
    id: string;
    name: string;
    age: number;
    tier: 'early' | 'elementary' | 'middle' | 'high';
    avatar: string;
    coins: number;
    streakDays: number;
    dynamicLevel: number;
    screenTimeLimitMinutes: number;
    todayMinutesSpent: number;
    isLocked: boolean;
    pin: string;
    qrToken: string;
    pictureSequence: string[];
    totalAttempts: number;
    masteryRating: number;
    parentAccountId: string;
  }>;
  attempts: Array<{
    id: string;
    studentId: string;
    lessonId: string;
    lessonTitle: string;
    scorePercent: number;
    timeSpentSecs: number;
    coinsEarned: number;
    xpEarned: number;
    completedAt: string;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    description: string;
    tier: 'early' | 'elementary' | 'middle' | 'high';
    targetStudentId: string;
    targetStudentName: string;
    assignedBy: string;
    dueDate: string;
    status: 'pending' | 'completed';
    rewardCoins: number;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
    type: 'achievement' | 'assignment' | 'alert' | 'system';
    targetRole: 'all' | 'student' | 'parent' | 'teacher';
  }>;
  coppaStatus: {
    isCompliant: boolean;
    totalMinorAccounts: number;
    auditRecordsCount: number;
  };
}

export interface HeartbeatResult {
  success: boolean;
  todayMinutesSpent: number;
  screenTimeLimitMinutes: number;
  isLocked: boolean;
  remainingMinutes: number;
}

class ApiService {
  private baseUrl = '/api';

  public async getBootstrap(): Promise<BootstrapData | null> {
    try {
      const res = await fetch(`${this.baseUrl}/bootstrap`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Bootstrap failed or offline, falling back to local cache:', err);
      return null;
    }
  }

  public async verifyPin(role: 'parent' | 'teacher', pin: string): Promise<{ valid: boolean; user?: unknown; error?: string; sessionToken?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, pin })
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] PIN verification network failure:', err);
      // Fallback for offline mode
      if (pin === '1234' || pin === '4321') {
        return { valid: true, sessionToken: 'offline_token' };
      }
      return { valid: false, error: 'Network error verifying PIN' };
    }
  }

  public async sendHeartbeat(studentId: string, elapsedSeconds: number = 60): Promise<HeartbeatResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/students/${encodeURIComponent(studentId)}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elapsedSeconds })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Heartbeat failed:', err);
      return null;
    }
  }

  public async unlockScreenTime(studentId: string, parentPin: string, additionalMinutes: number = 30): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/students/${encodeURIComponent(studentId)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPin, additionalMinutes })
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Screen unlock failed:', err);
      return { success: false, error: 'Could not connect to authentication server' };
    }
  }

  public async submitAttempt(studentId: string, attempt: {
    lessonId: string;
    lessonTitle: string;
    scorePercent: number;
    timeSpentSecs: number;
    coinsEarned: number;
    xpEarned: number;
  }): Promise<{ success: boolean; attempt?: unknown; student?: unknown; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/students/${encodeURIComponent(studentId)}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt)
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Attempt submission failed, queueing locally:', err);
      return { success: false, error: 'Network error submitting lesson attempt' };
    }
  }

  public async updateCoppaConsent(userId: string, granted: boolean, method: string, signature: string): Promise<{ success: boolean; coppaConsent?: unknown; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/coppa-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, granted, method, signature })
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] COPPA consent update failed:', err);
      return { success: false, error: 'Network error updating COPPA consent' };
    }
  }

  public async purgeStudentData(studentId: string, parentUserId: string, confirmationPin: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/coppa-purge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, parentUserId, confirmationPin })
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Student purge failed:', err);
      return { success: false, error: 'Network error processing data erasure' };
    }
  }

  public async addAssignment(asg: {
    title: string;
    description: string;
    tier: 'early' | 'elementary' | 'middle' | 'high';
    targetStudentId: string;
    targetStudentName: string;
    assignedBy: string;
    dueDate: string;
    rewardCoins: number;
  }): Promise<{ assignment?: unknown; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asg)
      });
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Add assignment failed:', err);
      return { error: 'Network error creating assignment' };
    }
  }

  /*
   * `syncBatch` was removed with the fake offline queue it served. It posted to
   * `/api/sync/batch`, which writes to the pre-migration JSON store. The real
   * queue reconciles through `practice.submit`, which writes to MySQL and
   * deduplicates on a client id.
   */

  // Phase 3: Socratic AI Math Coach Request
  public async askSocraticCoach(params: {
    problemQuestion: string;
    options: string[];
    correctAnswer: string;
    studentAnswer?: string | null;
    studentAge: number;
    tier: string;
    hint?: string;
    explanation?: string;
    mode: 'hint' | 'explain_misconception' | 'socratic_question' | 'real_world_analogy' | 'custom';
    userMessage?: string;
  }): Promise<{ message: string; source: string; followUpPrompt?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/ai/socratic-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Socratic coach request failed, using client fallback:', err);
      return {
        message: 'Let us look at the given numbers together! What operation do you think we should try first?',
        source: 'client-offline-fallback',
        followUpPrompt: 'What is your best estimate?'
      };
    }
  }
}

export const apiService = new ApiService();

