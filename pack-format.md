# Format paketa pitanja (pack format)

Aplikacija nema ugrađenih pitanja. Sva pitanja i fiksni ispiti dolaze iz **paketa** koje uvoziš u
*Biblioteka → Uvoz paketa*. Podržana su dva formata: **JSON** (kanonski) i **CSV** (sekundarni).

Uvoz je **aditivan**: novi ID-evi se dodaju, postojeći se preskaču (ili prepisuju ako uključiš
"Prepiši"). Nevažeća pitanja se odbacuju pojedinačno, važeća se zadržavaju. Nakon uvoza vidiš izvještaj
(dodano / preskočeno / prepisano / nevažeće s razlozima).

---

## 1. JSON

Datoteka sadrži objekt s ključem `questions` i/ili `exams` (barem jedan od njih).

```json
{
  "pack": "dumps-batch-1",
  "questions": [
    {
      "id": "dump-0042",
      "source": "dump",
      "lesson": 11,
      "topic": "IPsec VPN",
      "type": "single",
      "question": "Full question text, verbatim",
      "options": [
        { "id": "A", "text": "..." },
        { "id": "B", "text": "..." }
      ],
      "correct": ["B"],
      "explanation": "Optional short explanation",
      "image": "data:image/png;base64,..."
    }
  ],
  "exams": [
    {
      "id": "exam-1",
      "name": "Ispit 1",
      "questionIds": ["dump-0042", "kc-11-03"],
      "durationMinutes": 105,
      "passPercent": 70
    }
  ]
}
```

### Polja paketa

| Polje       | Obavezno | Opis |
|-------------|----------|------|
| `pack`      | ne       | Ime paketa (koristi se za "Obriši paket"). Ako nedostaje, uzima se ime datoteke. |
| `questions` | ne*      | Niz pitanja. |
| `exams`     | ne*      | Niz fiksnih ispita. |

\* Mora postojati barem jedan od `questions` / `exams`.

### Pitanje

| Polje         | Obavezno | Pravilo |
|---------------|----------|---------|
| `id`          | da       | Neprazan string, jedinstven i stabilan. |
| `source`      | da       | `dump` (originalno pitanje iz dumpa, doslovno) · `kc` (Knowledge Check iz zvaničnog PDF-a lekcije) · `quiz` (ATC quiz) · `claude` (pitanje koje je napisao Claude u stilu ispita). |
| `lesson`      | da       | Cijeli broj 1–16. |
| `topic`       | da       | Slobodan tekst (neprazan). |
| `type`        | da       | `single` (tačno 1 tačan odgovor) ili `multi` (2 ili više tačnih). |
| `question`    | da       | Tekst pitanja. Prijelomi redova (`\n`) se čuvaju. |
| `options`     | da       | Niz `{ "id": string, "text": string }`, 2–8 opcija, `id`-evi jedinstveni unutar pitanja. |
| `correct`     | da       | Niz `id`-eva opcija. Svaki mora postojati u `options`, bez duplikata. Dužina mora odgovarati `type`: `single` → 1, `multi` → ≥ 2. |
| `explanation` | ne       | Kratko objašnjenje (prikazuje se u Vježbi i u rezultatima). |
| `image`       | ne       | Exhibit kao `data:image/...` URI (png, jpeg, gif, webp, svg+xml, bmp). Prikazuje se iznad opcija, klik uvećava. |

Napomene:

* UI ispisuje **"Choose one"** odnosno **"Choose two" / "Choose three" …** prema `correct.length`.
* ID-evi opcija mogu biti bilo koji stringovi (`"A"`, `"opt1"`…). Pri prikazu se opcije miješaju, a
  slova se uvijek iznova dodjeljuju kao A, B, C… (mapiranje se pamti, rezultati ostaju tačni).
* `multi` je tačno samo ako je odabran **tačno** cijeli skup tačnih odgovora (parcijalni bodovi su
  opcija u Postavkama, zadano isključena: bodovi = max(0, (pogođeni − promašeni) / broj tačnih)).

### Ispit (fiksni, "Exam 1..5")

| Polje             | Obavezno | Pravilo |
|-------------------|----------|---------|
| `id`              | da       | Jedinstven neprazan string. |
| `name`            | da       | Prikazani naziv. |
| `questionIds`     | da       | Neprazan niz ID-eva pitanja, bez duplikata. ID-evi ne moraju već postojati (mogu doći iz drugog paketa); upozorenje se prikaže u izvještaju, a na kartici ispita "n/m pitanja dostupno". |
| `durationMinutes` | da       | Broj > 0. |
| `passPercent`     | da       | Broj 0–100. |

---

## 2. CSV

* UTF-8 (BOM je dozvoljen), separator **tačka-zarez** `;`, jedan zapis po retku.
* Prvi red je **header i mora biti tačno**:

  ```
  id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation
  ```

* Polja se dijele običnim `split(";")` — tačka-zarez se ne smije pojaviti unutar polja. Zapisi ne
  mogu sadržavati prijelom reda. Navodnici nemaju posebno značenje.
* Redovi s pogrešnim brojem polja (nije 13) se odbacuju i prijavljuju (s brojem retka); ostali se uvoze.
* Prazni redovi se ignorišu.
* `correct` su slova opcija odvojena zarezom, npr. `B` ili `B,D`. Mala slova se prihvataju.
  `type` se izvodi iz broja tačnih: 1 → `single`, ≥ 2 → `multi`.
* Prazne kolone opcija (`A`–`F`) se ignorišu; ID opcije je slovo kolone.
* `explanation` je opcionalna (može biti prazna).
* CSV nema exhibita ni ispita. Ime paketa je ime datoteke.
* Isti kriteriji validacije kao za JSON (npr. `lesson` 1–16, `source` iz liste, `correct` mora
  referencirati popunjenu opciju).

Primjer:

```
id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation
kc-11-03;kc;11;IPsec VPN;Primjer pitanja?;prvi;drugi;treci;;;;B;Kratko objašnjenje
kc-11-04;kc;11;IPsec VPN;Primjer s dva tačna;a;b;c;d;;;A,D;
```

---

## 3. Primjeri datoteka

* `sample-pack.json` – 6 izmišljenih placeholder pitanja (`source: "claude"` i još po jedno `kc`,
  `quiz`, `dump` radi testiranja filtera): single, 6-opcija, multi, multi (3), exhibit single i exhibit multi,
  plus jedan fiksni ispit.
* `sample-pack.csv` – 2 placeholder pitanja (UTF-8 s BOM-om).

Ovo **nisu** stvarna NSE4 pitanja.

---

## 4. Backup (različito od paketa)

*Postavke → Preuzmi backup* pravi JSON s `"app": "nse4-exam-backup"` koji sadrži pitanja, ispite,
historiju i postavke. Vraća se samo kroz *Postavke → Vrati iz backupa* (zamjenjuje sve podatke) i
ne može se uvesti kao paket.
