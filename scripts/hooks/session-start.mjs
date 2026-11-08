#!/usr/bin/env node
// SessionStart: injeta o estado do projeto em poucas linhas (stdout vira contexto).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { humanPending, load, nextTask, summary, taskFile } from "../roadmap.mjs";

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { tasks } = load();
  const s = summary(tasks);
  const doing = tasks.find((t) => t.status === "doing");
  const n = nextTask(tasks);
  const out = [`[Sócio] ${s.done}/${s.total} tarefas (${s.porFase})`];
  if (doing) out.push(`Em andamento: ${doing.id} ${doing.titulo} → ${taskFile(doing.id)}`);
  else if (n) out.push(`Próxima: ${n.id} ${n.titulo} [${n.quem}] → ${taskFile(n.id)}`);
  const hp = humanPending(tasks).filter((x) => !n || !x.startsWith(n.id));
  if (hp.length) out.push(`Pendências do usuário: ${hp.join("; ")}`);
  const sessionPath = path.join(root, "docs", "SESSION.md");
  if (fs.existsSync(sessionPath)) {
    const lines = fs.readFileSync(sessionPath, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("# ")).slice(0, 10);
    if (lines.length) out.push("Handoff:", ...lines);
  }
  out.push("Fluxo: /next → implementar → /done → /clear");
  console.log(out.join("\n"));
} catch {
  // Nunca bloquear a sessão por causa do hook.
}
