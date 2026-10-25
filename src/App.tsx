import { useEffect, useMemo, useState } from "react";
import { AVATARS, type Ack, type JoinedRoom, type RoomSnapshot } from "../shared/protocol";
import { GameView } from "./GameView";
import { createGameSocket } from "./apiSocket";

type ArenaSocket = ReturnType<typeof createGameSocket>;
type SavedSession = { code: string; token: string; nickname: string; avatar: (typeof AVATARS)[number] };
const SESSION_KEY = "chaos-arena-session";
function savedSession(): SavedSession | null {
  try { const value = localStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as SavedSession : null; } catch { return null; }
}

export default function App() {
  const socket = useMemo<ArenaSocket>(() => createGameSocket(), []);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>(AVATARS[0]);
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get("room")?.toUpperCase().slice(0, 6) ?? "");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [privateWord, setPrivateWord] = useState("");
  const [guessNotice, setGuessNotice] = useState("");
  const [myId, setMyId] = useState("");
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turnsPerPlayer, setTurnsPerPlayer] = useState<1 | 2>(1);
  const [turnDuration, setTurnDuration] = useState(60);

  useEffect(() => {
    const onConnect = () => {
      setConnection("connected");
      const saved = savedSession();
      if (saved) socket.emit("room:reconnect", { code: saved.code, token: saved.token }, (result) => {
        if (result.ok) acceptRoom(result.data, saved);
        else localStorage.removeItem(SESSION_KEY);
      });
    };
    const onDisconnect = () => setConnection("reconnecting");
    const onRoom = (snapshot: RoomSnapshot) => { setRoom(snapshot); if (snapshot.phase === "LOBBY") setPrivateWord(""); };
    const onPrivate = (data: { role: "artist" | "guesser"; secretWord?: string }) => setPrivateWord(data.role === "artist" ? data.secretWord ?? "" : "");
    const onFeedback = (data: { message: string }) => { setGuessNotice(data.message); window.setTimeout(() => setGuessNotice(""), 2400); };
    const onGameFeedback = (data: { message: string }) => { setGuessNotice(data.message); window.setTimeout(() => setGuessNotice(""), 2400); };
    const onCorrect = (data: { nickname: string; points: number }) => { setGuessNotice(`${data.nickname} got it! +${data.points}`); window.setTimeout(() => setGuessNotice(""), 2600); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoom);
    socket.on("round:private", onPrivate);
    socket.on("guess:feedback", onFeedback);
    socket.on("game:feedback", onGameFeedback);
    socket.on("guess:correct", onCorrect);
    socket.on("connect_error", () => setConnection("reconnecting"));
    socket.connect();
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("room:state", onRoom); socket.off("round:private", onPrivate); socket.off("guess:feedback", onFeedback); socket.off("game:feedback", onGameFeedback); socket.off("guess:correct", onCorrect); socket.disconnect(); };
  }, [socket]);

  function acceptRoom(data: JoinedRoom, profile: { nickname: string; avatar: SavedSession["avatar"] }) {
    setRoom(data.room); setMyId(data.playerId); setRoomCode(data.room.code); setNickname(profile.nickname); setAvatar(profile.avatar);
    socket.setSession(data.room.code, data.resumeToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code: data.room.code, token: data.resumeToken, ...profile } satisfies SavedSession));
    setError(""); setBusy(false);
  }
  function submit(action: "room:create" | "room:join") {
    setError(""); setBusy(true);
    const done = (result: Ack<JoinedRoom>) => {
      if (!result.ok) { setError(result.error.message); setBusy(false); return; }
      acceptRoom(result.data, { nickname: nickname.trim(), avatar });
    };
    if (action === "room:create") socket.emit(action, { nickname, avatar }, done);
    else socket.emit(action, { code: roomCode, nickname, avatar }, done);
  }
  function leaveRoom() {
    socket.emit("room:leave", () => { localStorage.removeItem(SESSION_KEY); setRoom(null); setPrivateWord(""); setMyId(""); setError(""); });
  }
  async function copyInvite() {
    const invite = `${window.location.origin}/?room=${room?.code}`;
    try { await navigator.clipboard.writeText(invite); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError(`Room code: ${room?.code} — copy it to invite friends.`); }
  }
  const me = room?.players.find((player) => player.id === myId);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="Chaos Arena home"><span className="brand-mark">C<span>A</span></span><span>CHAOS<br /><b>ARENA</b></span></a><div className="top-status"><span className={`status-dot ${connection}`} />{connection === "connected" ? "LIVE CONNECTION" : "RECONNECTING"}</div></header>
    {!room ? <section className="landing" id="top">
      <div className="hero-copy"><div className="eyebrow"><i /> THE PARTY STARTS HERE</div><h1>12 PLAYERS.<br /><span>1 ARENA.</span><br />ABSOLUTELY<br />NO PEACE.</h1><p>Grab your crew. Pick a name. Find out who thrives when everything gets a little chaotic.</p><div className="hero-chips"><span>✦ ROOM CODE INVITES</span><span>👥 UP TO 12 PLAYERS</span><span>📱 PLAY ANYWHERE</span></div></div>
      <div className="entry-card"><div className="card-top"><span className="card-kicker">PLAYER SETUP</span><span className="step">01 <i>/ 02</i></span></div><label className="field-label" htmlFor="nickname">YOUR NICKNAME</label><input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} placeholder="The chaos captain" autoComplete="nickname" />
        <div className="avatar-heading"><span className="field-label">PICK YOUR CREW FACE</span><span className="avatar-hint">tap one</span></div><div className="avatar-grid" role="radiogroup" aria-label="Choose an avatar">{AVATARS.map((item) => <button key={item} className={`avatar-option ${avatar === item ? "selected" : ""}`} onClick={() => setAvatar(item)} aria-label={`Choose avatar ${item}`} aria-checked={avatar === item} role="radio" type="button">{item}</button>)}</div>
        <div className="join-divider"><span>MAKE IT HAPPEN</span></div>
        <button className="primary-button" disabled={busy || connection !== "connected"} onClick={() => submit("room:create")}>CREATE A ROOM <span>↗</span></button>
        <div className="join-row"><input aria-label="Room code" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))} maxLength={6} placeholder="ROOM CODE" /><button className="join-button" disabled={busy || roomCode.length !== 6 || connection !== "connected"} onClick={() => submit("room:join")}>JOIN ROOM <span>→</span></button></div>
        {error && <div className="error-message" role="alert">⚠ {error}</div>}
        <div className="privacy-note"><span>✦</span> No accounts. No downloads. Just your people.</div>
      </div>
      <div className="hero-foot"><span>CHAOS IS BETTER TOGETHER</span><span>SCROLL LESS. PLAY MORE. <b>↓</b></span></div>
      <div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="spark spark-a">✳</div><div className="spark spark-b">✦</div>
    </section> : room.phase !== "LOBBY" ? <GameView socket={socket} room={room} myId={myId} privateWord={privateWord} notice={guessNotice} onLeave={leaveRoom} onError={setError} error={error} /> : <section className="lobby" id="top">
      <div className="lobby-head"><div><div className="eyebrow"><i /> THE ARENA IS OPEN</div><h1>THE <span>LOBBY</span></h1><p>Your crew is here. Invite friends with the room code and get your team together.</p></div><button className="leave-button" onClick={leaveRoom}>LEAVE ROOM <span>↗</span></button></div>
      <div className="lobby-grid"><div className="room-panel"><div className="room-code-label">ROOM CODE <span>SHARE THIS WITH YOUR CREW</span></div><div className="room-code">{room.code.split("").map((c, i) => <span key={`${c}${i}`}>{c}</span>)}</div><button className="copy-button" onClick={copyInvite}>{copied ? "✓ INVITE COPIED" : "▢ COPY INVITE"}</button><div className="room-divider"/><div className="slots-line"><span>PLAYERS IN ARENA</span><b>{room.players.length}<i> / 12</i></b></div><div className="slot-meter">{Array.from({ length: 12 }, (_, i) => <span key={i} className={i < room.players.length ? "filled" : ""} />)}</div><div className="min-note">{room.players.length < 2 ? `Invite ${2 - room.players.length} more ${2 - room.players.length === 1 ? "player" : "players"} to fill your crew` : "Minimum crew reached · invite up to 10 more"}</div><div className="start-settings"><label>DRAW TURNS PER PLAYER<select disabled={!me?.isHost} value={turnsPerPlayer} onChange={(e) => setTurnsPerPlayer(Number(e.target.value) as 1 | 2)}><option value="1">1 turn · fast match</option><option value="2">2 turns · extra chaos</option></select></label><label>DRAWING TIME<select disabled={!me?.isHost} value={turnDuration} onChange={(e) => setTurnDuration(Number(e.target.value))}><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="75">75 seconds</option></select></label>{me?.isHost ? <button className="primary-button start-match" disabled={room.players.filter((p) => p.connected).length < 2} onClick={() => socket.emit("game:start", { turnsPerPlayer, turnDuration }, (result) => { if (!result.ok) setError(result.error.message); })}>START THE MATCH <span>↗</span></button> : <div className="scoring-note">THE HOST SETS MATCH OPTIONS AND STARTS WHEN THE CREW IS READY.</div>}</div><div className="scoring-note">DRAW & GUESS · First correct: 500 pts, then 400 / 300 / 200 / 100. Artist earns 200 per correct guess.</div></div>
        <div className="crew-panel"><div className="crew-title"><div><span className="card-kicker">THE CREW</span><h2>WHO'S IN?</h2></div><span className="live-pill"><i /> LIVE</span></div><div className="player-list">{room.players.map((player, index) => <div className={`player-row ${player.id === myId ? "self" : ""}`} key={player.id}><div className="player-avatar">{player.avatar}<span className={player.connected ? "online" : "offline"} /></div><div className="player-name">{player.nickname}{player.id === myId && <small>YOU</small>}<span className="player-connection">{player.connected ? "IN THE ARENA" : "RECONNECTING..."}</span></div>{player.isHost ? <span className="host-badge">✦ HOST</span> : <span className="player-number">#{String(index + 1).padStart(2, "0")}</span>}</div>)}</div>{room.players.length < 12 && <div className="invite-nudge"><span>＋</span><div><b>More chaos, more fun.</b><br />Invite up to {12 - room.players.length} more players.</div></div>}</div></div>
      <div className="lobby-bottom"><div className="waiting-icon">✳</div><div><b>{me?.isHost ? "You're the host." : "You're in."}</b> {me?.isHost ? "Share the code and bring your crew into the arena." : "Share the room code with friends to fill the arena."}</div><div className="lobby-wait"><span className="pulse" /> ROOM IS LIVE</div></div>
      {error && <div className="error-message" role="alert">⚠ {error}</div>}
    </section>}
    <footer><span>CHAOS ARENA © 2026</span><span>MADE FOR THE BEAUTIFUL DISASTER OF FRIENDSHIP <b>✳</b></span></footer>
  </main>;
}
