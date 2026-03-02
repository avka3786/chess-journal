export type MotifMeta = { label: string; lichessUrl: string | null };

export const MOTIF_META: Record<string, MotifMeta> = {
  MATE_IN_1:         { label: "Mate in 1",          lichessUrl: "https://lichess.org/training/mateIn1" },
  MATE_IN_2:         { label: "Mate in 2",          lichessUrl: "https://lichess.org/training/mateIn2" },
  BACK_RANK_MATE:    { label: "Back-rank mate",      lichessUrl: "https://lichess.org/training/backRankMate" },
  HANGING_PIECE:     { label: "Hanging piece",       lichessUrl: "https://lichess.org/training/hangingPiece" },
  FORK:              { label: "Fork",                lichessUrl: "https://lichess.org/training/fork" },
  PIN:               { label: "Pin",                 lichessUrl: "https://lichess.org/training/pin" },
  SKEWER:            { label: "Skewer",              lichessUrl: "https://lichess.org/training/skewer" },
  DISCOVERED_ATTACK: { label: "Discovered attack",  lichessUrl: "https://lichess.org/training/discoveredAttack" },
  DISCOVERED_CHECK:  { label: "Discovered check",   lichessUrl: "https://lichess.org/training/discoveredCheck" },
  DEFLECTION:        { label: "Deflection",          lichessUrl: "https://lichess.org/training/deflection" },
  ATTRACTION:        { label: "Attraction",          lichessUrl: "https://lichess.org/training/attraction" },
  INTERMEZZO:        { label: "Intermezzo",          lichessUrl: "https://lichess.org/training/intermezzo" },
  TRAPPED_PIECE:     { label: "Trapped piece",       lichessUrl: "https://lichess.org/training/trappedPiece" },
  DEFENSIVE_MOVE:    { label: "Defensive move missed", lichessUrl: "https://lichess.org/training/defensiveMove" },
  QUIET_MOVE:        { label: "Quiet/positional move", lichessUrl: null },
};
