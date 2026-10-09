# NSE4 Exam Simulator (offline, jedna HTML datoteka)

Boson ExSim-stil simulator ispita za Fortinet NSE4 / FCP – FortiGate Administrator (FortiOS 7.6).
Aplikacija **ne sadrži pitanja** (osim sitnog placeholder primjera) – sve dolazi iz paketa koje uvoziš.

Izlaz je **jedna samodovoljna datoteka `nse4-exam.html`** (inline JS i CSS, bez CDN-a, bez fontova s mreže).
Radi dvoklikom (`file://`), potpuno offline.

## Pokretanje

Samo otvori `nse4-exam.html` u pregledniku (Chrome, Edge, Firefox…). Gotova datoteka je u repozitoriju.

## Build

Potreban je Node 20+.

```bash
npm install
npm run build      # tsc provjera + vite build + kopija u ./nse4-exam.html
```

Ostale skripte:

| Komanda               | Šta radi |
|-----------------------|----------|
| `npm run dev`         | Vite dev server (razvoj) |
| `npm test`            | Unit testovi (importer/validator, CSV, bodovanje, miješanje, backup, stats, 2000 pitanja) |
| `npm run typecheck`   | Samo TypeScript provjera |
| `npm run gen:big`     | Generiše sintetički paket od 1500 pitanja u `test-data/` (git-ignored) |
| `npm run e2e`         | Opcionalni browser testovi nad izgrađenom datotekom (Playwright; vidi dolje) |
| `npm run e2e:perf`    | Opcionalni test brzine s 2700 pitanja u pregledniku |

Za `e2e` treba preglednik: `npx playwright-core install chromium` (ili već instaliran Playwright Chromium 1187).

## Uvoz paketa

1. Otvori **Biblioteka**.
2. Prevuci `.json` / `.csv` datoteke u zonu za uvoz ili klikni **Odaberi datoteke** (može više odjednom).
3. Pogledaj izvještaj (dodano / preskočeno / nevažeće s razlozima).
   Ako želiš da postojeći ID-evi budu prepisani, uključi "Prepiši" prije uvoza.
4. Za brzi test klikni **Učitaj primjer paket**.

Tačan format je u [pack-format.md](pack-format.md).

## Stack

Vite + TypeScript + Preact (+ @preact/signals) + vite-plugin-singlefile. Izlaz ~110 KB.

```
src/core/      čista logika (validacija, uvoz, CSV, bodovanje, sesija, statistika, export, backup)
src/ui/        ekrani (Home, Runner, Results, History, Library, Custom, Settings)
src/store.ts   stanje (signals) + perzistencija
src/storage.ts IndexedDB → localStorage → memorija
tests/         vitest
e2e/           opcionalni Playwright testovi
```

## Pohrana podataka

Podaci žive u IndexedDB-u preglednika (fallback: localStorage). Ispit u toku se dodatno zrcali u
localStorage, pa osvježavanje stranice ne gubi napredak. Pošto je pohrana vezana za jedan preglednik
(i za putanju datoteke), redovno preuzimaj **backup** (*Postavke → Preuzmi backup*); traka za
podsjetnik se pojavljuje ako je zadnji backup stariji od 7 dana.
