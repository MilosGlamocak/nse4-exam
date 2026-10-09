# NSE4 Exam Simulator (offline, jedan HTML fajl)

Boson ExSim-stil simulator ispita za Fortinet NSE4 / FCP – FortiGate Administrator (FortiOS 7.6).
Aplikacija **ne sadrži pitanja** (osim sitnog placeholder primera) – sve dolazi iz paketa koje uvoziš.

Izlaz je **jedan samodovoljan fajl `nse4-exam.html`** (inline JS i CSS, bez CDN-a, bez fontova s mreže).
Radi dvoklikom (`file://`), potpuno offline.

## Pokretanje

Samo otvori `nse4-exam.html` u pregledaču (Chrome, Edge, Firefox…). Gotov fajl je u repozitoriju.

## Build

Potreban je Node 20+.

```bash
npm install
npm run build      # tsc provera + vite build + kopija u ./nse4-exam.html
```

Ostale skripte:

| Komanda               | Šta radi |
|-----------------------|----------|
| `npm run dev`         | Vite dev server (razvoj) |
| `npm test`            | Unit testovi (importer/validator, CSV, bodovanje, mešanje, backup, stats, 2000 pitanja) |
| `npm run typecheck`   | Samo TypeScript provera |
| `npm run gen:big`     | Generiše sintetički paket od 1500 pitanja u `test-data/` (git-ignored) |
| `npm run e2e`         | Opcionalni browser testovi nad izgrađenim fajlom (Playwright; vidi dole) |
| `npm run e2e:perf`    | Opcionalni test brzine s 2700 pitanja u pregledaču |

Za `e2e` treba pregledač: `npx playwright-core install chromium` (ili već instaliran Playwright Chromium 1187).

## Uvoz paketa

1. Otvori **Biblioteka**.
2. Prevuci `.json` / `.csv` fajlove u zonu za uvoz ili klikni **Izaberi fajlove** (može više odjednom).
3. Pogledaj izveštaj (dodato / preskočeno / nevažeće s razlozima).
   Ako želiš da postojeći ID-evi budu prepisani, uključi "Prepiši" pre uvoza.
4. Za brzi test klikni **Učitaj probni paket**.

Tačan format je u [pack-format.md](pack-format.md).

### Ugrađeni paketi (uvek na stranici)

Svaki fajl `samples/pack-*.json` se pri `npm run build` ugrađuje u `nse4-exam.html`. Pri prvom pokretanju
(po pregledaču) automatski se uvoze, a u Biblioteci imaju oznaku „ugrađen“. Posle toga se ponašaju kao svaki
drugi paket: ako ga obrišeš, ostaje obrisan (dugme **Vrati ugrađene pakete** ih vraća).

* Novi paket: ubaci `samples/pack-NN-ime.json` i pokreni `npm run build`.
* Izmena postojećeg paketa: promeni ime u polju `"pack"` (npr. `-v2` → `-v3`); pri sledećem otvaranju
  se uvozi ponovo i **prepisuje** pitanja sa istim ID-evima.
* Ugrađeni paketi povećavaju veličinu HTML-a (trenutno oko 3 MB).

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

## Čuvanje podataka

Podaci žive u IndexedDB-u pregledača (fallback: localStorage). Ispit u toku se dodatno zrcali u
localStorage, pa osvežavanje stranice ne gubi napredak. Pošto su podaci vezani za jedan pregledač
(i za putanju fajla), redovno preuzimaj **backup** (*Podešavanja → Preuzmi backup*); traka za
podsetnik se pojavljuje ako je poslednji backup stariji od 7 dana.
