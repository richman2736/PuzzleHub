# PuzzleHub – Sikkerhets- og robusthetsplan

Status: utkast • Eier: backend/mobil • Forutsetning: Worker er **ikke** deployet (kun
lokal `wrangler dev`), så ingenting haster akutt – vi kan gjøre det riktig.

Denne planen retter de verifiserte funnene fra gjennomgangen 2026-06-27. Hvert funn er
bekreftet mot koden; se sporbarhetstabellen nederst.

## Bærende innsikt

Datamodellen i [`packages/db/src/schema.ts`](../packages/db/src/schema.ts) er allerede
**bruker-sentrert og server-autoritativ**: `users` / `sessions` / `accounts` (Better-Auth-formet),
`user_game_progress` (med `started_at` / `completed_at` / `score`), `puzzles` (med `solution_data`),
`user_stats`, `user_streaks`, `user_achievements`, `leaderboards`.

Runtime-koden tok derimot en **enhets-anonym snarvei** forbi denne modellen:
`completion_events.device_id`, `device_stats`, `device_achievements`,
`game_sync_state.owner_device_id`, og ingen auth. Alle funnene 1–3 og deler av 5 stammer
fra dette gapet. Remediasjon = konverger runtime mot den allerede designede bruker-modellen
og koble på ekte auth.

Valgt strategi (bekreftet med eier): **implementer ekte auth (Better Auth) nå** som fundament,
før de strukturelle fiksene som avhenger av identitet.

## Rekkefølge og avhengigheter

```
Fase 1  Auth-fundament (Better Auth)        ──┐  forutsetning for 2 og 3
Fase 2  Completion-integritet (#1)          ──┤  bruker user_game_progress + puzzles.solution
Fase 3  Sync-robusthet (#2 payload, #7 race)──┘  bruker session-identitet fra fase 1
Fase 4  Mobil end-to-end (#4, #5, #6)         →  avhenger av at fase 1–3 er korrekte
Fase 5  Web admin (#9)                         (uavhengig, lav)
Fase 6  Avhengigheter (#8)                     (uavhengig – kan kjøres når som helst)
```

## Vaktbøyler (gjelder hver fase)

Hver fase skal lande grønn på hele kjeden før den merges:

```
bun run typecheck && bun run lint && bun run format:check \
  && bun run test && bun run test:stress \
  && bun run build:worker && bun run build:web
```

Nye migrasjoner legges i [`packages/db/migrations/`](../packages/db/migrations/) med neste
sekvensnummer (siste er `0006_achievements.sql`) og speiles i `schema.ts`.

---

## Fase 1 — Auth-fundament (funn 3)

**Mål:** Ingen skrive-endepunkt (`/v1/game/complete`, `/v1/sync`) kan nås uten en gyldig
sesjon. Rå `deviceId` slutter å være tillitsanker; `userId` fra sesjonen blir det.

**Endringer**

- Legg til Better Auth i Worker-en, montert i Hono (`/v1/auth/*` erstatter dagens 501-stub i
  [`apps/worker/src/index.ts:600`](../apps/worker/src/index.ts)). D1-adapter mot de eksisterende
  `users`/`sessions`/`accounts`-tabellene. Bearer/Expo-sesjon for mobil (Better Auth har offisiell
  Expo-plugin).
- `requireAuth()`-middleware (parallell til dagens `requireAdmin()`) som slår opp sesjon →
  `userId`, setter den på Hono-context, og returnerer 401 ved manglende/utløpt sesjon.
- Hemmeligheter (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`) via
  `wrangler secret`/vars, aldri committet.
- Sekvensering: bindingen «`op.deviceId` må tilhøre sesjonsbrukeren» og userId-scoping av GET
  `/v1/sync` flyttes til **Fase 3**, der sync-lageret uansett endres (sync_ops/ownership blir
  userId-nøklet). Fase 1 leverer auth-fundamentet + gaten.

**Migrasjon** `0007_auth_schema.sql` — utvid `users`/`sessions`/`accounts` til Better Auths
påkrevde kolonner (f.eks. `users.email_verified`, `sessions.ip_address`/`user_agent`,
`accounts.password`/token-kolonner) og legg til `verification`-tabellen. Speil i `schema.ts`.

**Tester**

- `auth.test.ts`: anonym POST mot `/v1/sync` og `/v1/game/complete` → 401; gyldig sesjon → 200;
  ukonfigurert auth → 503. Session-resolver-seam (`__setSessionResolverForTests`) lar HTTP-kontrakt-
  testene kjøre bak `requireAuth` uten en live auth-database.

**Akseptanse:** Alle skrive-endepunkt krever sesjon; suiten grønn. (Cross-user-op-avvisning hører til
Fase 3.)

### Status — implementert (2026-06-28)

Levert og grønt på hele vaktbøyle-kjeden (typecheck, lint, format, 130 unit-tester, build:worker,
build:web):

- `@puzzlehub/auth` `createAuth()` bygger Better Auth (Drizzle/D1-adapter, `usePlural`, magic-link +
  bearer); DB-klienten bygges i `@puzzlehub/db` (`createAuthDb`).
- Worker: `/v1/auth/*` montert (bak rate-limit), `requireAuth()` + session-resolver-seam, gate på
  `/v1/game/complete` og POST/GET `/v1/sync`, `userId` lagt på Hono-context.
- Migrasjon `0007_auth_schema.sql` + Drizzle-speiling (`email_verified`, session-fingeravtrykk,
  account-token-kolonner, `verifications`).

**Gjenstår før flyten er brukbar live (kan ikke verifiseres i dette miljøet — trenger ekte D1):**

1. **Runtime-verifisering av Better Auth ↔ D1-mapping.** Unit-testene bruker seam-et, så
   drizzle-adapterens `usePlural`-mapping mot flertalls-tabellene er ikke trent av testene. Kjør
   `wrangler dev` + et reelt sign-in-forsøk for å bekrefte at migrasjonskolonnene matcher Better Auths
   forventninger.
2. **E-postlevering av magic links** er en stubb (logger kun `magic_link_issued`). Koble en transport
   (se `cloudflare-email-service`) før innlogging fungerer ende-til-ende.
3. **Sett hemmeligheter:** `wrangler secret put BETTER_AUTH_SECRET` (+ `BETTER_AUTH_URL`,
   `BETTER_AUTH_TRUSTED_ORIGINS` som vars) per miljø.

**Restrisiko etter Fase 1:** En _autentisert_ bruker kan fremdeles oppgi en annens `deviceId` i sync,
og GET `/v1/sync?deviceId=…` er ikke userId-scopet ennå — begge lukkes i Fase 3. Gaten fjerner all
_anonym_ tilgang, som var kjernen i funn 3.

---

## Fase 2 — Completion-integritet (funn 1)

**Mål:** Server godtar bare en completion som faktisk er løst og eies av innsenderen.

**Endringer**

- Gjør [`POST /v1/game/start`](../apps/worker/src/index.ts) _stateful_: persister puslespillet
  (seed + `solution_data`) i `puzzles` og en attempt-rad i `user_game_progress`
  (`id` = `progressId`, `user_id`, `puzzle_id`, `started_at`). Server kjenner nå fasiten for
  hver påbegynt attempt.
- I [`POST /v1/game/complete`](../apps/worker/src/index.ts:520):
  1. Slå opp `progressId` i `user_game_progress`; verifiser at `user_id` == sesjonsbruker (ellers 403).
  2. Krev innsendt sluttbrett i payload; verifiser mot `puzzles.solution_data`
     (eller regenerér løsning fra `seed` server-side og sammenlign). Ikke løst → 422.
  3. Behold eksisterende server-side score-recompute ([`index.ts:539`](../apps/worker/src/index.ts:539))
     og anti-cheat-flagg ([`completion.ts` `flagCompletion`](../apps/worker/src/completion.ts)).
  4. Skriv completion-eventen mot **bruker**-modellen, ikke `device_id`.
- Utvid `completeGameSchema` i [`packages/validation/src/index.ts:38`](../packages/validation/src/index.ts)
  med påkrevd `board` (9×9 sluttbrett); fjern tilliten til klient-`score` (allerede ignorert).
- Migrer completion-loggen og nedstrøms aggregering (stats/streaks/achievements/leaderboard) fra
  `device_*`-tabellene til `user_*`-tabellene som allerede finnes i `schema.ts`.

**Migrasjon** `0008_user_completion_events.sql` — `completion_events` (og evt. `device_stats`/
`device_achievements`) får `user_id`; unik idempotens-nøkkel blir `(user_id, progress_id)`.

**Tester**

- Completion uten gyldig løst brett → 422.
- Completion mot annen brukers `progressId` → 403.
- Duplikat (samme `user_id`+`progressId`) håndteres som før (ikke re-recorded).
- Riktig løst brett → score/XP/flagg som forventet; event lander i bruker-loggen.

**Akseptanse:** Leaderboard kan ikke lenger fôres med fabrikkerte completions; suiten grønn.

---

## Fase 3 — Sync-robusthet (funn 2 + 7)

**Mål:** Sync-payload er validert og kan ikke relaye sensitive felt; revisjons-oppdatering er
atomisk uten tap.

**Endringer (funn 2 – payload-allowlist)**

- Erstatt åpen `payload: z.record(z.string(), z.unknown())`
  ([`validation/index.ts:69`](../packages/validation/src/index.ts)) med **strenge per-op-type-skjemaer**
  (`move` / `complete` / `reset`) som kun tillater de feltene hver op faktisk trenger. Avvis ukjente
  felt (strict), og forby eksplisitt `solution` / `seed` / `givens`.
- Forsvar i dybden: utvid `toPublicSyncOp` ([`index.ts:318`](../apps/worker/src/index.ts:318)) til å
  redigere/strippe i stedet for `payload: op.payload` rått ut.

**Endringer (funn 7 – rev compare-and-set)**

- Gjør `appendAppliedOp` ([`sync.ts:237`](../apps/worker/src/sync.ts:237)) til en _betinget_ skriv:
  `UPDATE game_sync_state SET rev = :appliedRev, ... WHERE game_id = :id AND rev = :expectedRev`.
  0 endrede rader ⇒ tap mot en samtidig skriver ⇒ behandle som `conflict` (eller intern retry) i stedet
  for å overskrive. Flytt rev-sjekken inn i `WHERE`-klausulen så lese-skrive-vinduet i
  [`applySyncBatch`](../apps/worker/src/sync.ts:55) ikke lenger er en TOCTOU.
- Alternativ vurdert: Durable Object per game (full serialisering). ADR-0001 favoriserer D1-først, så
  betinget D1-oppdatering er førstevalg; DO noteres som opsjon hvis kontensjon blir et problem.

**Tester** (utvid [`sync.test.ts`](../apps/worker/src/sync.test.ts))

- To samtidige batch-er mot samme `gameId` kan ikke begge skrive samme `rev`.
- Payload med `solution`-felt avvises av skjemaet (og lekker ikke via GET `/v1/sync`).

**Akseptanse:** Ingen rev-dobbeltskriving; sensitive payload-felt avvist; suiten grønn.

---

## Fase 4 — Mobil end-to-end (funn 4, 5, 6)

**Mål:** Appen henter ekte puslespill, driver progresjon mot serveren, og synker toveis.

**Endringer (funn 4 – fast puzzle/gameId)**

- Bytt hardkodet `generateSudoku({ seed: "mobile-preview" })`
  ([`App.tsx:191`](../apps/mobile/App.tsx)) med ekte henting fra Worker
  (`GET /v1/daily` eller `POST /v1/game/start`); bruk server-`progressId` som `gameId`.
  Behold en offline-fallback, men ikke en delt konstant id.

**Endringer (funn 5 – completion sendes aldri)**

- Når `state.status === "completed"` ([`App.tsx:378`](../apps/mobile/App.tsx)): kall
  `POST /v1/game/complete` med sluttbrettet, og enqueue en `complete`-outbox-op
  (`toServerOpType` støtter den allerede – [`syncClient.ts:90`](../apps/mobile/src/syncClient.ts)).

**Endringer (funn 6 – push-only + destruktiv undo/reset)**

- Implementer **pull**: en `pull`-metode på `SyncTransport`
  ([`syncClient.ts:54`](../apps/mobile/src/syncClient.ts)) mot `GET /v1/sync`, med reconcile/restore
  ved oppstart og etter nettverksgjenoppretting.
- Endre undo/reset fra `DELETE FROM sync_outbox`
  ([`sudokuRepository.ts:391`](../apps/mobile/src/sudokuRepository.ts),
  [`:233`](../apps/mobile/src/sudokuRepository.ts:233)): slett kun _upushede_ pending-ops; for ops som
  allerede er sendt, emitér en **kompenserende** op i stedet for å droppe historikk.
- Koble auth-klient (sesjons-token fra fase 1) på alle sync/complete-kall.

**Tester:** enhetstester for pull/reconcile og kompenserende undo; mobil-e2e (`test:mobile:e2e`)
for «fullfør puzzle → stats/XP oppdateres» og «andre enhet gjenoppretter via pull».

**Akseptanse:** Fullføring driver server-stats; ny enhet restaurerer tilstand; undo etter push
reconciler korrekt.

---

## Fase 5 — Web admin (funn 9)

**Mål:** Web er enten et ekte (token-beskyttet) adminverktøy, eller tydelig merket som demo.

**Endringer**

- Koble «Publish daily»-knappen ([`web/src/App.tsx:45`](../apps/web/src/App.tsx)) til
  `POST /v1/admin/daily/publish` med admin-token, og last ekte metrics fra
  `/v1/admin/daily/status` + `/v1/stats` i stedet for hardkodede verdier
  ([`:52-55`](../apps/web/src/App.tsx)). Token injiseres via miljø, aldri committet.
- Alternativ (hvis web ikke skal være admin ennå): fjern de villedende kontrollene og merk siden
  eksplisitt som statisk demo.

**Akseptanse:** Ingen knapp/metrikk gir inntrykk av funksjonalitet som ikke finnes.

---

## Fase 6 — Avhengigheter (funn 8)

**Mål:** Lukk de 10 `bun audit`-funnene (4 high / 3 moderate / 3 low) via `ws`, `undici`, `uuid`,
`esbuild` – alle transitivt via bygg/dev-tooling (wrangler, vite, expo, react-native).

**Endringer**

- Kjør kontrollert `bun update` (evt. `--latest` for de som krever major), verifiser at intet runtime-
  API brytes, og kjør hele vaktbøyle-kjeden på nytt. Pin der nødvendig.
- Re-kjør `bun audit` og dokumenter eventuelle gjenværende (kun-Windows-dev, ikke-runtime) funn som
  akseptert risiko.

**Akseptanse:** `bun audit` rent (eller kun dokumenterte, ikke-runtime-funn); suiten grønn.

---

## Sporbarhet funn → fase

| #   | Funn                                                | Verdikt                                                    | Fase |
| --- | --------------------------------------------------- | ---------------------------------------------------------- | ---- |
| 1   | `/game/complete` verifiserer ikke at puzzle er løst | Bekreftet                                                  | 2    |
| 2   | Åpen sync-payload relayes ufiltrert                 | Delvis (omdøpt fra «Kritisk solution-lekkasje» til Medium) | 3    |
| 3   | Sync mangler identitet/ownership                    | Bekreftet                                                  | 1    |
| 4   | Mobil bruker fast puzzle + fast gameId              | Bekreftet                                                  | 4    |
| 5   | Mobil sender ikke completion                        | Bekreftet                                                  | 4    |
| 6   | Push-only sync; destruktiv undo/reset               | Bekreftet                                                  | 4    |
| 7   | D1 rev-race (ingen compare-and-set)                 | Bekreftet                                                  | 3    |
| 8   | 10 `bun audit`-sårbarheter                          | Bekreftet eksakt                                           | 6    |
| 9   | Web/admin er statisk shell                          | Bekreftet                                                  | 5    |
