// Lightweight ApiService for frontend clients
// Usage: const api = new ApiService({ baseUrl: 'http://localhost:3000' });
// api.setToken('<JWT>'); await api.createTask({...});

export type TaskPayload = {
  employerProfileId?: string; // server will override when using auth
  title: string;
  objective: string;
  deliverables: string;
  acceptanceCriteria: string;
  rewardPoints: number;
  deadline?: string; // ISO
};

export type UserPayload = {
  profileId: string;
  username?: string;
  professionalRoles?: string[];
};

export type ApplicationPayload = {
  taskId: number;
  applicantProfileId: string;
  coverLetter?: string;
};

export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export default class ApiService {
  baseUrl: string;
  token?: string;

  constructor(opts: { baseUrl: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
  }

  setToken(token?: string) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private async handleResponse(res: Response) {
    const contentType = res.headers.get('content-type') || '';
    let body: any = null;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    if (!res.ok) throw new ApiError(res.status, body?.error || res.statusText, body);
    return body;
  }

  // Users
  async listUsers() {
    const res = await fetch(`${this.baseUrl}/users`, { headers: this.headers() });
    return this.handleResponse(res);
  }

  async createUser(payload: UserPayload) {
    const res = await fetch(`${this.baseUrl}/users`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  async getUser(profileId: string) {
    try {
        const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(profileId)}`, { headers: this.headers() });
        return this.handleResponse(res);
    } catch (error) {
        console.error('Error fetching user:', error);
        throw new ApiError(500, 'Internal Server Error');
    }
  }

  async updateUser(profileId: string, payload: Partial<UserPayload>) {
    const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(profileId)}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  async deleteUser(profileId: string) {
    const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(profileId)}`, { method: 'DELETE', headers: this.headers() });
    return this.handleResponse(res);
  }

  async adjustPoints(profileId: string, payload: { rewardPoints?: number; reputationScore?: number }) {
    const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(profileId)}/adjust-points`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  // Tasks

  async listTasks() {
    const res = await fetch(`${this.baseUrl}/tasks`, { headers: this.headers() });
    return this.handleResponse(res);
  }

  async createTask(payload: TaskPayload) {
    const res = await fetch(`${this.baseUrl}/tasks`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  async getTask(id: number | string) {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, { headers: this.headers() });
    return this.handleResponse(res);
  }

  async updateTask(id: number | string, payload: Partial<TaskPayload>) {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  async deleteTask(id: number | string) {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, { method: 'DELETE', headers: this.headers() });
    return this.handleResponse(res);
  }

  // Applications
  async listApplications() {
    const res = await fetch(`${this.baseUrl}/applications`, { headers: this.headers() });
    return this.handleResponse(res);
  }

  async listApplicationsForTask(taskId: number | string) {
    const res = await fetch(`${this.baseUrl}/applications/task/${taskId}`, { headers: this.headers() });
    return this.handleResponse(res);
  }

  async createApplication(payload: ApplicationPayload) {
    const res = await fetch(`${this.baseUrl}/applications`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    return this.handleResponse(res);
  }

  async updateApplication(id: number | string, status: 'pending' | 'accepted' | 'rejected') {
    const res = await fetch(`${this.baseUrl}/applications/${id}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify({ status }) });
    return this.handleResponse(res);
  }

  async deleteApplication(id: number | string) {
    const res = await fetch(`${this.baseUrl}/applications/${id}`, { method: 'DELETE', headers: this.headers() });
    return this.handleResponse(res);
  }
}

// Example usage (frontend):
// const api = new ApiService({ baseUrl: 'http://localhost:3000' });
// api.setToken(localStorage.getItem('token'))
// await api.createTask({ title: '...', objective: '...', deliverables: '...', acceptanceCriteria: '...', rewardPoints: 100 })
