import { gameCatalog } from "@puzzlehub/config";
import { generateSudoku } from "@puzzlehub/sudoku-engine";
import { Activity, CalendarDays, Database, Puzzle, Settings, Trophy } from "lucide-react";
import { useMemo } from "react";

export function App() {
  const dailyPreview = useMemo(
    () => generateSudoku({ difficulty: "medium", seed: "web-daily-preview" }),
    [],
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <Puzzle size={24} />
          <span>PuzzleHub</span>
        </div>
        <nav className="nav-list">
          <a className="nav-item active" href="#daily">
            <CalendarDays size={18} />
            Daily
          </a>
          <a className="nav-item" href="#stats">
            <Activity size={18} />
            Stats
          </a>
          <a className="nav-item" href="#packs">
            <Database size={18} />
            Packs
          </a>
          <a className="nav-item" href="#settings">
            <Settings size={18} />
            Settings
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">MVP control surface</p>
            <h1>Daily puzzle operations</h1>
          </div>
          <button className="publish-button" type="button">
            <CalendarDays size={18} />
            Publish daily
          </button>
        </header>

        <section className="metrics-grid" aria-label="PuzzleHub metrics">
          <Metric title="Playable games" value="1" detail="Sudoku live first" />
          <Metric title="Daily queue" value="7" detail="Next week seeded" />
          <Metric title="Sync mode" value="Local" detail="Backend backup later" />
          <Metric title="Achievements" value="5" detail="Draft rules ready" />
        </section>

        <section className="content-grid">
          <div className="panel" id="daily">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Sudoku preview</p>
                <h2>Medium daily board</h2>
              </div>
              <span className="status-pill">Unique solution</span>
            </div>
            <div className="sudoku-preview">
              {dailyPreview.puzzle.grid.flatMap((row, rowIndex) =>
                row.map((value, colIndex) => (
                  <div
                    className={`sudoku-cell ${value === 0 ? "" : "given"} ${
                      colIndex % 3 === 2 && colIndex !== 8 ? "box-right" : ""
                    } ${rowIndex % 3 === 2 && rowIndex !== 8 ? "box-bottom" : ""}`}
                    key={`${rowIndex}-${colIndex}`}
                  >
                    {value === 0 ? "" : value}
                  </div>
                )),
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Game rollout</p>
                <h2>Platform roadmap</h2>
              </div>
              <Trophy size={20} />
            </div>
            <div className="game-list">
              {gameCatalog.map((game) => (
                <div className="game-row" key={game.type}>
                  <div>
                    <strong>{game.name}</strong>
                    <span>{game.defaultDifficulty}</span>
                  </div>
                  <span className={`status-pill ${game.status === "mvp" ? "live" : ""}`}>
                    {game.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
