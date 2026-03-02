import { spawn } from "child_process";

export const STOCKFISH_PATH =
  process.env.STOCKFISH_PATH ?? "/usr/local/bin/stockfish";

export type EngineResult = {
  depth: number;
  evalCp: number | null;
  evalMate: number | null;
  bestMoveUci: string | null;
  pvUci: string | null;
};

function sideToMove(fen: string): "w" | "b" {
  return (fen.split(" ")[1] ?? "w") as "w" | "b";
}

function toWhite(val: number, stm: "w" | "b"): number {
  return stm === "w" ? val : -val;
}

function parseInfoLines(
  lines: string[],
  fen: string
): { evalCp: number | null; evalMate: number | null; pvUci: string | null } {
  const stm = sideToMove(fen);
  let evalCp: number | null = null;
  let evalMate: number | null = null;
  let pvUci: string | null = null;

  let lastInfo = "";
  for (const line of lines) {
    if (line.startsWith("info ") && line.includes(" depth ")) lastInfo = line;
  }

  if (lastInfo) {
    const cpM = lastInfo.match(/score cp (-?\d+)/);
    const mateM = lastInfo.match(/score mate (-?\d+)/);
    const pvM = lastInfo.match(/ pv (.+)/);
    if (cpM) evalCp = toWhite(parseInt(cpM[1], 10), stm);
    if (mateM) evalMate = toWhite(parseInt(mateM[1], 10), stm);
    if (pvM) pvUci = pvM[1].trim().split(" ").slice(0, 8).join(" ");
  }

  return { evalCp, evalMate, pvUci };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProcess = any;

export class StockfishEngine {
  private proc: AnyProcess;
  private lineBuf = "";

  constructor() {
    this.proc = spawn(STOCKFISH_PATH, [], { stdio: ["pipe", "pipe", "ignore"] });
  }

  private send(cmd: string) {
    this.proc.stdin.write(cmd + "\n");
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs = 30_000
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const collected: string[] = [];
      const timer = setTimeout(() => {
        this.proc.stdout.off("data", onData);
        reject(new Error("Stockfish timed out"));
      }, timeoutMs);

      const onData = (data: Buffer) => {
        this.lineBuf += data.toString();
        const parts = this.lineBuf.split("\n");
        this.lineBuf = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          collected.push(trimmed);
          if (predicate(trimmed)) {
            clearTimeout(timer);
            this.proc.stdout.off("data", onData);
            resolve(collected);
            return;
          }
        }
      };
      this.proc.stdout.on("data", onData);
    });
  }

  async init(): Promise<void> {
    this.send("uci");
    await this.waitFor((l) => l === "uciok");
    this.send("isready");
    await this.waitFor((l) => l === "readyok");
  }

  async analyze(fen: string, depth = 14): Promise<EngineResult> {
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const lines = await this.waitFor((l) => l.startsWith("bestmove"), 60_000);

    const bestLine = lines.find((l) => l.startsWith("bestmove")) ?? "";
    const rawBest = bestLine.split(" ")[1] ?? null;
    const bestMoveUci = rawBest && rawBest !== "(none)" ? rawBest : null;
    const parsed = parseInfoLines(lines, fen);

    return { depth, bestMoveUci, ...parsed };
  }

  quit() {
    try { this.send("quit"); } catch { /* ignore */ }
    this.proc.kill();
  }
}
