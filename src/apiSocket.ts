import type { ClientToServerEvents } from "../shared/protocol";
type Session = { code: string; token: string };
type Listener = (...args: any[]) => void;

/** Keeps the existing screen components intact while replacing persistent sockets with short HTTP calls and polling. */
export class ApiSocket {
  private listeners = new Map<string, Set<Listener>>();
  private session: Session | null = null;
  private timer: number | undefined;
  private busy = false;
  private connected = false;
  private revision = -1;
  private chain: Promise<unknown> = Promise.resolve();
  private pendingStrokes = new Map<string, { strokeId: string; color: string; width: number; points: { x: number; y: number }[]; done: boolean }>();
  private drawTimer: number | undefined;

  on(event: string, listener: Listener) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(listener); return this; }
  off(event: string, listener?: Listener) { if (!listener) this.listeners.delete(event); else this.listeners.get(event)?.delete(listener); return this; }
  private dispatch(event: string, ...args: unknown[]) { for (const listener of this.listeners.get(event) ?? []) listener(...args); }

  connect() { this.connected = true; this.dispatch("connect"); if (this.session) this.startPolling(); return this; }
  disconnect() { this.connected = false; if (this.timer) window.clearInterval(this.timer); this.timer = undefined; this.dispatch("disconnect"); return this; }
  setSession(code: string, token: string) { this.session = { code, token }; if (this.connected) this.startPolling(); }
  clearSession() { this.session = null; this.revision = -1; if (this.timer) window.clearInterval(this.timer); this.timer = undefined; }

  emit<K extends keyof ClientToServerEvents>(event: K, ...args: Parameters<ClientToServerEvents[K]>): this;
  emit(event: string, ...args: any[]) {
    const callback = typeof args.at(-1) === "function" ? args.pop() as Listener : undefined;
    const payload = args[0];
    if (event === "draw:stroke") { this.queueStroke(payload); return this; }
    const code = event === "room:create" ? undefined : event === "room:join" ? payload?.code : event === "room:reconnect" ? payload?.code : this.session?.code;
    const token = event === "room:reconnect" ? payload?.token : this.session?.token;
    if (event === "draw:undo" || event === "draw:clear") this.flushStrokes();
    this.chain = this.chain.then(() => this.send({ action: event, code, token, payload }, event, callback));
    return this;
  }

  private queueStroke(stroke: any) {
    if (!stroke || typeof stroke.strokeId !== "string") return;
    const previous = this.pendingStrokes.get(stroke.strokeId);
    if (previous) { previous.points.push(...stroke.points); previous.done ||= stroke.done; }
    else this.pendingStrokes.set(stroke.strokeId, { strokeId: stroke.strokeId, color: stroke.color, width: stroke.width, points: [...stroke.points], done: stroke.done });
    if (this.drawTimer) window.clearTimeout(this.drawTimer);
    this.drawTimer = window.setTimeout(() => this.flushStrokes(), stroke.done ? 20 : 120);
  }

  private flushStrokes() {
    if (this.drawTimer) window.clearTimeout(this.drawTimer);
    this.drawTimer = undefined;
    const strokes = [...this.pendingStrokes.values()]; this.pendingStrokes.clear();
    for (const stroke of strokes) for (let offset = 0; offset < stroke.points.length; offset += 40) {
      const payload = { ...stroke, points: stroke.points.slice(offset, offset + 40), done: stroke.done && offset + 40 >= stroke.points.length };
      const session = this.session;
      if (session) this.chain = this.chain.then(() => this.send({ action: "draw:stroke", ...session, payload }, "draw:stroke"));
    }
  }

  private async send(body: Record<string, unknown>, event: string, callback?: Listener) {
    try {
      const response = await fetch("/.netlify/functions/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.ok) { callback?.(result); if (!callback) this.dispatch("room:error", result.error); return; }
      const data = result.data;
      if (["room:create", "room:join", "room:reconnect"].includes(event)) {
        this.setSession(data.room.code, data.resumeToken);
        this.acceptState(data);
      } else if (data.room) this.acceptState(data);
      if (data.privateWord) this.dispatch("round:private", { role: "artist", secretWord: data.privateWord });
      else if (data.room?.match?.stage === "DRAW_GUESS") this.dispatch("round:private", { role: "guesser" });
      if (data.feedback) this.dispatch(event === "guess:submit" ? "guess:feedback" : "game:feedback", { kind: data.correct === false || data.early ? "wrong" : "correct", message: data.feedback });
      if (event === "guess:submit" && data.correct) {
        const player = data.room.players.find((person: { id: string }) => person.id === data.playerId);
        this.dispatch("guess:correct", { playerId: data.playerId, nickname: player?.nickname ?? "A player", points: data.points, guessesRemaining: 0 });
      }
      if (event === "room:leave") this.clearSession();
      if (callback) callback({ ok: true, data: this.ackData(event, data) });
    } catch {
      this.dispatch("connect_error");
      callback?.({ ok: false, error: { code: "INVALID_ACTION", message: "Connection interrupted. Retrying…" } });
    }
  }

  private ackData(event: string, data: any) {
    if (["room:create", "room:join", "room:reconnect"].includes(event)) return data;
    if (event === "game:start" || event === "game:rematch") return { started: true };
    if (event === "game:return-lobby") return { returned: true };
    if (event === "room:leave") return { left: true };
    if (event === "reflex:press") return { status: data.early ? "early" : "scored", reactionMs: data.responseMs };
    return { submitted: true };
  }

  private acceptState(data: any) {
    if (data.room) {
      if (typeof data.revision === "number" && data.revision < this.revision) return;
      if (typeof data.revision === "number") this.revision = data.revision;
      this.dispatch("room:state", data.room);
      const match = data.room.match;
      if (match?.stage === "DRAW_GUESS") this.dispatch("draw:history", match.drawing ?? []);
      if (match?.stage === "DRAW_GUESS") {
        const me = data.playerId;
        if (match.artistId === me && data.privateWord) this.dispatch("round:private", { role: "artist", secretWord: data.privateWord });
        else this.dispatch("round:private", { role: "guesser" });
      } else this.dispatch("round:private", { role: "guesser" });
    }
  }

  private startPolling() {
    if (this.timer) window.clearInterval(this.timer);
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), 1_500);
  }
  private async poll() {
    if (!this.session || this.busy || !this.connected) return;
    this.busy = true;
    try {
      const response = await fetch("/.netlify/functions/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "poll", ...this.session }) });
      const result = await response.json();
      if (!response.ok || !result.ok) { this.dispatch("connect_error"); return; }
      this.acceptState(result.data);
      if (this.listeners.get("disconnect")?.size) { /* keep event subscriptions alive across polling cycles */ }
    } catch { this.dispatch("connect_error"); }
    finally { this.busy = false; }
  }
}

export function createGameSocket() { return new ApiSocket(); }
