# Chess Journal

A local-only web app to import and track chess games from chess.com PGN exports.

## Stack

- Next.js 15 (App Router) + TypeScript
- SQLite via Prisma ORM
- chess.js for PGN parsing and FEN generation
- Tailwind CSS

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client and create the database
npx prisma migrate dev --name init

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Go to **Import PGN** (`/import`)
2. Paste PGN text or upload a `.pgn` file (multi-game exports supported)
3. Click **Import**
4. View imported games at `/games`

## Database

SQLite file lives at `prisma/dev.db` (created after running migrations).

### Schema

- **Game** — metadata (players, result, opening, ECO, time control, raw PGN)
- **Move** — every ply with `fenBefore` / `fenAfter` for future mistake analysis
