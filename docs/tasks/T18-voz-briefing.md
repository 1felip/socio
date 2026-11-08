# T18 · Voz e briefing diário
Fase 2 · Quem: CLAUDE · Depende: T15, T17 · Estimativa: 3–4 h · Skills: tom-socio, n8n-workflows

## Entregar
- [ ] Áudio recebido → transcrição (role audio) → "Entendi: …" antes de qualquer ação.
- [ ] `POST /api/briefing/:merchantId`: números de ontem pelo Analista → roteiro de até ~110 palavras → ElevenLabs → Storage → URL.
- [ ] Workflow `briefing-daily` (10h, America/Sao_Paulo) exportado em `n8n/`.
- [ ] Versão em texto do briefing no painel.

## Aceite
```
pnpm check
```
Briefing gerado para as 3 lojas; cada áudio com menos de 60 s.
