import { memo, useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DrawingStroke, Point, RoomSnapshot } from "../shared/protocol";
import type { ApiSocket } from "./apiSocket";

type Props = {
  socket: ApiSocket;
  room: RoomSnapshot;
  myId: string;
  privateWord: string;
  notice: string;
  error: string;
  onError: (message: string) => void;
  onLeave: () => void;
};

const COLORS = ["#1a1724", "#ffffff", "#ff5977", "#ff9f43", "#ffe05e", "#65e58f", "#46f1e4", "#4a9eff", "#b985ff"];
const BRUSHES = [3, 7, 12, 20];

function DrawingCanvas({ drawing, socket, canDraw, color, brush }: { drawing: DrawingStroke[]; socket: Props["socket"]; canDraw: boolean; color: string; brush: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ id: string; color: string; width: number; points: Point[] } | null>(null);
  const pending = useRef<Point[]>([]);
  const flushTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const redraw = () => {
      const rect = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      element.width = Math.max(1, Math.round(rect.width * scale));
      element.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = element.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#fffdf9"; ctx.fillRect(0, 0, rect.width, rect.height);
      for (const stroke of drawing) {
        ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.width * rect.width / 800); ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (stroke.points.length === 1) { ctx.beginPath(); ctx.arc(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (stroke.points.length > 1) {
          ctx.beginPath(); ctx.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height);
          for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x * rect.width, stroke.points[i].y * rect.height);
          ctx.stroke();
        }
      }
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(element);
    redraw();
    return () => observer.disconnect();
  }, [drawing]);

  function flush(done = false) {
    const stroke = active.current;
    if (!stroke || (!pending.current.length && !done)) return;
    const points = pending.current.splice(0, 40);
    socket.emit("draw:stroke", { strokeId: stroke.id, color: stroke.color, width: stroke.width, points, done });
    if (done) active.current = null;
  }
  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    active.current = { id: crypto.randomUUID(), color, width: brush, points: [p] };
    pending.current = [p]; flushTimer.current = window.setInterval(() => flush(false), 45);
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !active.current) return;
    event.preventDefault();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const sample of samples) {
      const rect = event.currentTarget.getBoundingClientRect();
      const p = { x: Math.min(1, Math.max(0, (sample.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (sample.clientY - rect.top) / rect.height)) };
      active.current.points.push(p); pending.current.push(p);
    }
    if (pending.current.length >= 40) flush(false);
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!active.current) return;
    event.preventDefault(); const p = point(event);
    active.current.points.push(p); pending.current.push(p);
    if (flushTimer.current) window.clearInterval(flushTimer.current);
    flush(true);
  }
  useEffect(() => () => { if (flushTimer.current) window.clearInterval(flushTimer.current); }, []);

  return <canvas ref={canvas} className={`draw-canvas ${canDraw ? "artist-canvas" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label={canDraw ? "Shared drawing canvas. Draw here." : "Shared drawing"} />;
}
const MemoDrawingCanvas = memo(DrawingCanvas);

export function GameView({ socket, room, myId, privateWord, notice, error, onError, onLeave }: Props) {
  const match = room.match!;
  const [now, setNow] = useState(Date.now());
  const [drawing, setDrawing] = useState<DrawingStroke[]>(match.drawing);
  const [guess, setGuess] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [brush, setBrush] = useState(BRUSHES[1]);
  const artist = room.players.find((player) => player.id === match.artistId);
  const isArtist = myId === match.artistId;
  const canDraw = isArtist && match.phase === "ACTIVE_ROUND";
  const timeLeft = Math.max(0, Math.ceil(((match.deadlineAt ?? now) - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { setDrawing(match.drawing); }, [match.round, match.phase, match.drawing]);
  useEffect(() => {
    const onDraw = (data: { strokeId: string; color: string; width: number; points: Point[] }) => setDrawing((previous) => {
      const existing = previous.find((stroke) => stroke.id === data.strokeId);
      if (existing) return previous.map((stroke) => stroke.id === data.strokeId ? { ...stroke, points: [...stroke.points, ...data.points] } : stroke);
      return [...previous, { id: data.strokeId, color: data.color, width: data.width, points: data.points }];
    });
    const onHistory = (history: DrawingStroke[]) => setDrawing(history);
    socket.on("draw:accepted", onDraw); socket.on("draw:history", onHistory);
    return () => { socket.off("draw:accepted", onDraw); socket.off("draw:history", onHistory); };
  }, [socket]);

  function submitGuess(event: FormEvent) {
    event.preventDefault();
    if (!guess.trim()) return;
    socket.emit("guess:submit", { text: guess }, (result) => { if (!result.ok) onError(result.error.message); });
    setGuess("");
  }
  function submitMiniAnswer(answer: string) {
    const event = match.stage === "CHAOS_FINALE" ? "finale:submit" : "quiz:submit";
    socket.emit(event, { answer }, (result) => { if (!result.ok) onError(result.error.message); });
  }
  function pressReflex() { socket.emit("reflex:press", (result) => { if (!result.ok) onError(result.error.message); }); }
  function startRematch() { socket.emit("game:rematch", (result) => { if (!result.ok) onError(result.error.message); }); }
  function returnToLobby() { socket.emit("game:return-lobby", (result) => { if (!result.ok) onError(result.error.message); }); }
  function undo() { socket.emit("draw:undo"); }
  function clear() { if (window.confirm("Clear the shared canvas for everyone?")) socket.emit("draw:clear"); }
  const ranked = Object.entries(match.scores).map(([id, score]) => ({ player: room.players.find((p) => p.id === id), score })).filter((item) => item.player).sort((a, b) => b.score - a.score);
  const bestScore = ranked[0]?.score ?? 0;
  const champions = ranked.filter((item) => item.score === bestScore);

  return <section className="game-screen" id="top">
    <header className="game-top"><a className="brand" href="#top"><span className="brand-mark">C<span>A</span></span><span>CHAOS<br /><b>ARENA</b></span></a><div className="game-room">ROOM <b>{room.code}</b><span className="live-pill"><i /> LIVE</span></div><button className="leave-button" onClick={onLeave}>LEAVE ROOM <span>↗</span></button></header>
    {match.phase === "COUNTDOWN" ? <div className="phase-card"><div className="eyebrow"><i /> THE CREW IS LOCKED IN</div><div className="phase-count">{timeLeft || "GO"}</div><h1>GET READY TO <span>DRAW.</span></h1><p>Each player gets a turn. Guess fast. Artist scores when the crew gets it right.</p><div className="score-rule">FIRST GUESS <b>500</b> <i>→</i> LATER GUESSES <b>400 · 300 · 200 · 100</b> <i>·</i> ARTIST <b>+200</b> EACH</div></div>
    : match.phase === "ROUND_INTRO" ? <div className="phase-card"><div className="eyebrow"><i /> {match.stage.replaceAll("_", " ")} · ROUND {match.round} <span className="phase-total">/ {match.totalRounds}</span></div><div className="phase-count">{timeLeft || "GO"}</div>{match.stage === "DRAW_GUESS" ? <><h1>{isArtist ? "YOU'RE THE " : "EYES ON THE "}<span>{isArtist ? "ARTIST." : "CANVAS."}</span></h1><p>{isArtist ? "Draw the word below before time runs out. The faster your crew guesses, the more you score." : `${artist?.nickname ?? "The artist"} is drawing. Guess the word as soon as it clicks.`}</p>{isArtist && <div className="secret-word">YOUR SECRET WORD <b>{privateWord || "••••••••"}</b></div>}</> : match.stage === "REFLEX_RUMBLE" ? <><h1>HOLD YOUR <span>NERVOUS ENERGY.</span></h1><p>Wait for cyan. Tap too early and your response is locked out.</p></> : <><h1>{match.stage === "CHAOS_FINALE" ? "THE FINAL " : "BRAIN "}<span>{match.stage === "CHAOS_FINALE" ? "GLITCH." : "GLITCH."}</span></h1><p>{match.question?.prompt}</p></>}</div>
    : match.phase === "ROUND_RESULTS" ? match.stage === "DRAW_GUESS" ? <div className="results-screen"><div className="eyebrow"><i /> ROUND {match.round} COMPLETE</div><h1>THE WORD WAS <span>{match.revealedWord}</span></h1><p>{match.artistDisconnected ? "The artist disconnected, so this turn ended without scoring." : "Nice guesses. Get ready for the next artist."}</p><div className="result-players">{room.players.filter((p) => p.id === match.artistId || match.guessedPlayerIds.includes(p.id)).map((player) => <div key={player.id} className="result-chip"><span>{player.avatar}</span><b>{player.nickname}</b><small>{player.id === match.artistId ? "ARTIST +200 PER GUESS" : "GOT IT"}</small></div>)}</div><Leaderboard ranked={ranked.slice(0, 6)} /></div> : <MiniResults room={room} match={match} ranked={ranked} />
    : match.phase === "FINAL_RESULTS" ? <div className="results-screen final-results"><div className="eyebrow"><i /> ARENA CHAMPION{champions.length > 1 ? "S" : ""}</div><div className="champion-icon">{champions.length === 1 ? champions[0].player?.avatar : "🏆"}</div><h1>{champions.map((item) => item.player?.nickname).join(" & ")} <span>WIN!</span></h1><p>{champions.length > 1 ? "A perfect tie. The arena crowns you together." : "The chaos was real. The champion is undeniable."}{match.correctAnswer ? ` Finale answer: ${match.correctAnswer} — ${match.explanation}` : ""}</p><Leaderboard ranked={ranked} /><div className="result-actions">{room.players.find((p) => p.id === myId)?.isHost && <><button className="primary-button" onClick={startRematch}>PLAY AGAIN <span>↗</span></button><button className="leave-button" onClick={returnToLobby}>BACK TO LOBBY</button></>}<button className="leave-button" onClick={onLeave}>LEAVE ROOM <span>↗</span></button></div></div>
    : <ActiveRoundView socket={socket} room={room} myId={myId} match={match} artist={artist} isArtist={isArtist} canDraw={canDraw} drawing={drawing} color={color} brush={brush} guess={guess} notice={notice} error={error} timeLeft={timeLeft} setColor={setColor} setBrush={setBrush} setGuess={setGuess} submitGuess={submitGuess} submitMiniAnswer={submitMiniAnswer} pressReflex={pressReflex} undo={undo} clear={clear} />}
    {match.phase !== "ACTIVE_ROUND" && error && <div className="error-message game-error" role="alert">⚠ {error}</div>}
  </section>;
}

function Leaderboard({ ranked }: { ranked: { player: RoomSnapshot["players"][number] | undefined; score: number }[] }) {
  return <div className="final-board">{ranked.map((item, index) => <div className={`final-row ${index === 0 ? "top-rank" : ""}`} key={item.player!.id}><span>{String(index + 1).padStart(2, "0")}</span><i>{item.player!.avatar}</i><b>{item.player!.nickname}</b><strong>{item.score}<small> PTS</small></strong></div>)}</div>;
}

type ActiveProps = {
  socket: Props["socket"]; room: RoomSnapshot; myId: string; match: NonNullable<RoomSnapshot["match"]>;
  artist?: RoomSnapshot["players"][number]; isArtist: boolean; canDraw: boolean; drawing: DrawingStroke[];
  color: string; brush: number; guess: string; notice: string; error: string; timeLeft: number;
  setColor: (color: string) => void; setBrush: (brush: number) => void; setGuess: (guess: string) => void;
  submitGuess: (event: FormEvent) => void; submitMiniAnswer: (answer: string) => void; pressReflex: () => void;
  undo: () => void; clear: () => void;
};

function ActiveRoundView(props: ActiveProps) {
  const { socket, room, myId, match, artist, isArtist, canDraw, drawing, color, brush, guess, notice, error, timeLeft } = props;
  const ranked = Object.entries(match.scores).map(([id, score]) => ({ player: room.players.find((p) => p.id === id), score })).filter((item) => item.player).sort((a, b) => b.score - a.score);
  const submitted = match.submittedPlayerIds?.includes(myId) ?? false;
  return <div className="active-game">
    <div className="active-header"><div><div className="eyebrow"><i /> {match.stage.replaceAll("_", " ")} · ROUND {match.round}{match.stage === "BRAIN_GLITCH" ? " / 5" : ""}</div><h1>{match.stage === "DRAW_GUESS" ? isArtist ? "MAKE THEM GUESS." : "WHAT'S THE WORD?" : match.stage === "REFLEX_RUMBLE" ? "TRUST YOUR REFLEXES." : match.stage === "BRAIN_GLITCH" ? "BRAIN ON. TIME OFF." : "THE FINAL GLITCH."}</h1></div><div className={`game-timer ${timeLeft <= 10 ? "urgent" : ""}`}><span>{match.stage === "REFLEX_RUMBLE" && !match.signalVisible ? "HOLD..." : "TIME LEFT"}</span><b>{match.stage === "REFLEX_RUMBLE" && !match.signalVisible ? "···" : `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`}</b></div></div>
    <div className="active-layout">
      {match.stage === "DRAW_GUESS" ? <div className="canvas-column"><div className="canvas-topline"><span className="artist-label"><b>{artist?.avatar} {artist?.nickname}</b> IS DRAWING</span><span className="guess-count">✦ {match.guessedPlayerIds.length} / {Math.max(0, room.players.length - 1)} GUESSED</span></div><div className="canvas-frame"><MemoDrawingCanvas drawing={drawing} socket={socket} canDraw={canDraw} color={color} brush={brush} /></div>{canDraw && <div className="drawing-tools"><div className="color-tools" aria-label="Brush colors">{COLORS.map((item) => <button key={item} className={`color-swatch ${color === item ? "selected" : ""}`} style={{ "--swatch": item } as CSSProperties} onClick={() => props.setColor(item)} aria-label={`Set brush color ${item}`} />)}</div><div className="brush-tools">{BRUSHES.map((size) => <button key={size} className={`brush-choice ${brush === size ? "selected" : ""}`} onClick={() => props.setBrush(size)} aria-label={`Brush size ${size}`}><i style={{ width: size + 2, height: size + 2 }} /></button>)}<button className="tool-button" onClick={() => props.setColor("#ffffff")}>⌫ ERASER</button><button className="tool-button" onClick={props.undo}>↶ UNDO</button><button className="tool-button" onClick={props.clear}>⌫ CLEAR</button></div></div>}{!isArtist && <form className="guess-form" onSubmit={props.submitGuess}><input value={guess} onChange={(event) => props.setGuess(event.target.value)} maxLength={64} placeholder="Type your guess..." aria-label="Your guess" disabled={match.guessedPlayerIds.includes(myId)} /><button type="submit" disabled={!guess.trim() || match.guessedPlayerIds.includes(myId)}>SEND GUESS <span>→</span></button></form>}</div>
      : match.stage === "REFLEX_RUMBLE" ? <div className={`reflex-panel ${match.signalVisible ? "signal-live" : ""}`}><div className="reflex-ring">{match.signalVisible ? "⚡" : "…"}</div><h2>{match.signalVisible ? "NOW!" : "WAIT FOR IT..."}</h2><p>{match.signalVisible ? "Tap once. Server timing decides your reaction score." : "A false start locks your response. Wait for the cyan signal."}</p><button className={`reflex-button ${match.signalVisible ? "ready" : ""}`} disabled={submitted} onClick={props.pressReflex}>{submitted ? "RESPONSE LOCKED" : match.signalVisible ? "TAP NOW!" : "WAIT FOR SIGNAL"}</button></div>
      : <div className="question-panel"><div className="question-tag">{match.stage === "CHAOS_FINALE" ? "THE CHAOS FINALE · BONUS ROUND" : `BRAIN GLITCH · QUESTION ${match.round} OF 5`}</div><h2>{match.question?.prompt}</h2><div className="answer-choices">{match.question?.choices.map((choice, index) => <button key={choice} className="answer-choice" disabled={submitted || match.phase !== "ACTIVE_ROUND"} onClick={() => props.submitMiniAnswer(choice)}><span>{String.fromCharCode(65 + index)}</span>{choice}</button>)}</div><p className="answer-tip">{submitted ? "Answer locked. See how the crew did when time runs out." : "One answer only · faster correct answers earn a speed bonus."}</p></div>}
      <ScorePanel ranked={ranked} match={match} />
    </div>
    {notice && <div className="game-notice" role="status">✦ {notice}</div>}{error && <div className="error-message" role="alert">⚠ {error}</div>}
  </div>;
}

function ScorePanel({ ranked, match }: { ranked: { player: RoomSnapshot["players"][number] | undefined; score: number }[]; match: NonNullable<RoomSnapshot["match"]> }) {
  return <aside className="score-panel"><div className="score-panel-title"><span className="card-kicker">THE SCOREBOARD</span><span className="live-pill"><i /> LIVE</span></div>{ranked.slice(0, 8).map((item, index) => <div className="score-row" key={item.player!.id}><span className="score-rank">{String(index + 1).padStart(2, "0")}</span><span className="score-avatar">{item.player!.avatar}</span><span className="score-name">{item.player!.nickname}{match.guessedPlayerIds.includes(item.player!.id) && <small>GOT IT!</small>}</span><b>{item.score}</b></div>)}<div className="score-key"><b>SCORING</b>{match.stage === "DRAW_GUESS" ? <><span>First guess <i>500</i></span><span>Next guesses <i>400 → 100</i></span><span>Artist / correct guess <i>+200</i></span></> : match.stage === "REFLEX_RUMBLE" ? <><span>Fastest <i>500</i></span><span>Top five <i>350 → 100</i></span><span>Early tap <i>0</i></span></> : <><span>Correct answer <i>{match.stage === "CHAOS_FINALE" ? "600" : "300"}+</i></span><span>Speed bonus <i>up to 200</i></span></>}</div></aside>;
}

function MiniResults({ room, match, ranked }: { room: RoomSnapshot; match: NonNullable<RoomSnapshot["match"]>; ranked: { player: RoomSnapshot["players"][number] | undefined; score: number }[] }) {
  const answers = [...(match.answers ?? [])].sort((a, b) => (a.early ? Infinity : a.responseMs ?? Infinity) - (b.early ? Infinity : b.responseMs ?? Infinity));
  return <div className="results-screen"><div className="eyebrow"><i /> {match.stage === "REFLEX_RUMBLE" ? "REFLEX RUMBLE" : match.stage === "CHAOS_FINALE" ? "CHAOS FINALE" : `BRAIN GLITCH · QUESTION ${match.round}`} RESULTS</div>{match.stage !== "REFLEX_RUMBLE" && <><h1>{match.question?.prompt}<span>{match.correctAnswer}</span></h1><p>{match.explanation}</p></>}<div className="mini-result-list">{answers.map((answer, index) => { const player = room.players.find((p) => p.id === answer.playerId); return player && <div className="mini-result-row" key={answer.playerId}><span>{index + 1}</span><i>{player.avatar}</i><b>{player.nickname}</b><span>{answer.early ? "FALSE START" : match.stage === "REFLEX_RUMBLE" ? `${answer.responseMs ?? "—"} ms` : answer.correct ? "CORRECT" : "NOT QUITE"}</span><strong>+{answer.points}</strong></div>; })}</div><Leaderboard ranked={ranked.slice(0, 6)} /></div>;
}
