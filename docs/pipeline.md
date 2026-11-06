# Pipeline: von Aufnahme und Noten zur Übungsseite

Die Lieder einer Produktion liegen in einem eigenen, privaten Repo (Content-Root,
`<produktion>-content` neben diesem Repo). Alle Befehle laufen dort;
dessen `mp.ps1` reicht an das `mp.ps1` der Engine weiter und setzt den Content-Root
als Arbeitsverzeichnis:

```
./mp.ps1 tool <script> ...
```

## Ordner

| Ordner | Inhalt | Git |
|---|---|---|
| `sources/audio/Musik`, `sources/audio/Playback` | Vollmix und Playback als MP3, Dateiname beginnt mit `NN ` | Produktion |
| `sources/text/` | Liedtexte (docx) und Notenblätter (pdf) | Produktion |
| `scores/` | Transkriptionen: `NN.abc` (Erstfassung von Hand), `NN.musicxml` (für MuseScore) | Produktion |
| `work/` | Zwischenergebnisse: `decoded/`, `subtracted/`, `pitch/`, `score/`, `edits/` | Produktion, ignoriert |
| `web/data/` | Was der Editor lädt: `NN.json` (ein Lied je Eintrag in `sources/config.json`), `NN_*.mp3`, `NN_spec.png` | Produktion |
| `tools/` | Skripte | Engine |
| `web/` | Editor | Engine |

Alles unter `sources/`, `scores/` und die abgeleiteten Daten in `web/data/` sind
urheberrechtlich geschützt: Sie liegen nur im privaten Produktions-Repo, öffentlich
nur verschlüsselt (ADR 0006, 0007).

## 1. Audio: Gesang aus dem Mix holen

### 1a. Ausrichtung prüfen

```
./mp.ps1 tool align_check          # alle Lieder
./mp.ps1 tool align_check 12 13    # nur diese
```

Dekodiert nach `work/decoded/NN_mix.wav` und `NN_pb.wav`, bestimmt den
Sample-Versatz per Kreuzkorrelation, prüft Drift und Restenergie, schreibt
`work/align_report.json`.

### 1b. Subtraktion (nur bei sauberer Ausrichtung)

```
./mp.ps1 tool subtract_vocals NN
```

Zieht das Playback mit per-Frequenz angepasster Verstärkung vom Mix ab.
Ergebnis `work/subtracted/NN_vocals.wav` und `NN_backing.wav`. Für Lieder, deren
Playback nicht sauber ausgerichtet ist, stattdessen Demucs (`htdemucs`) verwenden.

### 1c. MP3s für die Seite

```
ffmpeg -i "sources\audio\Musik\NN ....mp3" -ac 1 -b:a 128k web\data\NN_mix.mp3
ffmpeg -i work\subtracted\NN_vocals.wav  -b:a 128k web\data\NN_vocals.mp3
ffmpeg -i work\subtracted\NN_backing.wav -b:a 128k web\data\NN_no_vocals.mp3
```

`pack` nimmt genau diese Dateien: `NN_mix.mp3` als Stimmen, `NN_no_vocals.mp3`
als Begleitung (Song mit `backing: demucs`). Die Begleitung muss so lang sein wie
der Mix (±20 ms); Demucs-Stems sind etwas länger, also beim Kodieren mit
`-t <Mix-Dauer>` kürzen.

## 2. Tonhöhe des Gesangs

Zwei Tracker, gleiche Ausgabe (`work/pitch/<id>.json` plus Kontrollbild `.png`,
10 ms Raster):

```
# neuronale Tracker, empfohlen (CREPE genauer, FCPE schneller)
./mp.ps1 tool extract_pitch_nn NN work\subtracted\NN_vocals.wav "Titel" ^
    --method crepe --audio NN_mix.mp3 --stem-file vocals=NN_vocals.mp3 --stem-file no_vocals=NN_no_vocals.mp3 ^
    --mix work\decoded\NN_mix.wav --fmin E2 --highpass 90 --fold-octaves

# klassisch (pYIN), gleiche Optionen ohne --method/--fold-octaves
./mp.ps1 tool extract_pitch NN work\subtracted\NN_vocals.wav "Titel" ...
```

Wichtige Optionen:

- `--mix` und `--leak-gate-db` (Standard −10): Frames, in denen der Gesangsstem
  gegenüber dem Mix schwach ist, gelten als stumm. Nötig, weil in der Subtraktion
  Instrumentalreste bleiben.
- `--fmin`, `--highpass`: unterdrücken Bass-Drones im Residuum.
- `--fold-octaves`: Duett in Oktaven (Mann/Frau) wird auf eine Linie gefaltet.
- `--audio`, `--stem-file`: welche MP3s die Seite anbietet.

Die Ausgabe-JSON ist die Datei, die die Seite lädt (Felder `pitch`, `notes`,
`audio`, `stems`, `hop_s`). Ohne Partitur sind `notes` die automatisch
segmentierten Töne; damit ist die Seite schon benutzbar, aber ungenau.

## 3. Partitur erzeugen

Ziel ist immer das Score-JSON (`work/score/NN_score.json`): Liste von Noten
mit `bar`, `beat`, `dur` (in Vierteln), `midi`, `name`, optional `lyric`,
`section`, `role`. Drei Wege dorthin:

### 3a. Vektor-PDF (Finale/Maestro-Font)

```
./mp.ps1 tool score_from_pdf "sources\text\NN ....pdf" work\score\NN_score.json --key-flats 1
```

Liest Notenköpfe, Balken, Bögen, Taktstriche und Textsilben direkt aus den
PDF-Glyphen. Gibt pro Takt die Zählzeiten aus; ein Takt, der nicht auf 4
kommt, ist ein Parse-Fehler. Funktioniert nur bei PDFs mit Vektor-Noten,
nicht bei Scans.

### 3b. Scans (JPG im docx)

Für gescannte Noten gibt es keinen automatischen Weg mit brauchbarer Qualität
bei 60 dpi. Vorgehen:

1. Bilder aus dem docx ziehen (`word/media/` ist eine ZIP) nach `work/docx_media/`.
2. Melodie von Hand als ABC in `scores/NN.abc` schreiben (Erstfassung, ohne Text):

   ```
   T: Titel
   K: G
   M: 4/4
   L: 1/4
   Q: 100
   %% section Refrain
   G A B c | d2 B G | A/2 B/2 c B A | G4 |
   %% section Strophe
   ...
   ```

   Unterstützt: Noten `A-G`/`a-g`, Oktaven `,` `'`, Vorzeichen `^ _ =`,
   Dauern `2`, `/2`, `3/2`, Bindebögen `-`, Pausen `z`, Taktstriche,
   `%% section NAME` für Abschnitte, die in der Aufnahme mehrfach vorkommen.

3. Umwandeln: `./mp.ps1 tool abc_to_score scores\NN.abc work\score\NN_score.json`
4. Korrigieren in MuseScore, siehe 3c.

Alternative für bessere Scans (≥ 300 dpi): Audiveris (Open Source OMR)
erzeugt MusicXML, das direkt über 3c einlesbar ist.

### 3c. MuseScore (Korrekturschleife)

```
# Score-JSON -> MusicXML zum Bearbeiten
./mp.ps1 tool score_to_musicxml work\score\NN_score.json scores\NN.musicxml --key G --title "..." --bpm 100

# in MuseScore öffnen, korrigieren, Text eingeben, als MusicXML exportieren, dann zurück:
./mp.ps1 tool score_from_musicxml scores\NN.musicxml work\score\NN_score.json
```

Der Import nimmt den ersten Part und bei Akkorden den höchsten Ton, fasst
Bindebögen zusammen und liest Stafftext/Studierzeichen als Abschnittsnamen
(`section`). Jede Note behält ihre MuseScore-Stimme (`voice`); eine Pause fällt
weg, solange eine andere Stimme singt. `--roles 1=anna,2=chor` setzt `role` aus
der Stimme (Rollen-IDs aus `sources/config.json`). Noten werden nach Rolle
eingefärbt, wenn das Score-JSON `role` und `roles` enthält (siehe 5).

Strophen als Liedtextzeilen (Strophe 1, 2, … in MuseScore) landen pro Note in
`lyrics`; die Ausrichtung gibt dem n-ten Vorkommen eines Abschnitts Strophe n
(die letzte wiederholt sich, z. B. Schlussrefrain). Übergebundene Noten bleiben
einzelne Noten, wie notiert (auch über den Taktstrich); die erste bekommt
`tie: true`, die Bewertung zählt die Kette als eine Note. Eine Note mit
Bindebogen bekommt `slur: true`. Für beide zeichnet die Notenanzeige einen Bogen
zur nächsten Note derselben Rolle. Rap als Slash-Notenköpfe (MuseScore:
Notenkopf „Schrägstrich“) wird zu `spoken: true`: in der App mit Rhythmus und
Silbe angezeigt, nie bewertet. Im Editor setzt oder löscht der Knopf „Rap“ das
Flag für die ausgewählten Noten.

## 4. Partitur an die Aufnahme ausrichten

```
./mp.ps1 tool align_score work\score\NN_score.json work\pitch\NN.json work\pitch\NN_aligned.json ^
    --bpm 100 --repeat-bars 9-12 --passes 2 --snap
```

Subsequenz-DTW, oktavunabhängig. Jeder Abschnitt (`section`) wird so oft
gesucht, wie er in der Aufnahme vorkommt (`--passes`), solange die mittleren
Kosten unter `--max-cost` (0.3) bleiben. `--repeat-bars` für Wiederholungen
innerhalb eines Abschnitts. `--form "Refrain:anna,Strophe,Refrain:chor"` nennt
die Abschnitte in gesungener Reihenfolge, optional mit Rolle je Block; ersetzt
`--passes` und bricht ab, wenn die Blöcke in anderer Reihenfolge gefunden werden. `--snap` ersetzt den Notenwert durch den
gesungenen Ton, wenn sie deutlich abweichen (Feld `score_midi` bleibt
erhalten). Die Ausgabe druckt pro Durchlauf Kosten und impliziertes Tempo:

- Kosten ≈ 0.10, Tempo in allen Durchläufen gleich: Partitur stimmt.
- Kosten 0.2–0.3: Erstfassung mit Fehlern, in MuseScore nachbessern.

Findet ein Abschnitt auch Blöcke eines anderen (Strophe frisst Refrain),
`--max-cost` senken, bis jeder Block beim richtigen Abschnitt landet.
`--grid` legt jeden Durchlauf ins Partiturtempo (`--bpm`), verankert am Median
der DTW-Zeiten; für Playbacks mit festem Tempo, wenn DTW Phrasenanfänge zu spät
setzt.

Gesprochene Noten (Rap) haben keine Tonhöhe: Sie kosten gegen jeden Audio-Frame
gleich viel, die gesungenen Noten drumherum legen sie fest. `--snap` lässt sie
aus, und `--grid` verankert nur an gesungenen Noten. Ein Abschnitt nur aus Rap
lässt sich so nicht allein finden: Lieder mit Rap als einen Block ausrichten
(Partitur ausgeschrieben, ohne Abschnittsnamen) mit `--grid`.

Kontrollbild: `./mp.ps1 tool plot_aligned work\pitch\NN_aligned.json work\pitch\NN_aligned.png 20 40`
(blau Partitur, rot gesnappt, orange Gesang).

## 5. Rollen (wer singt was)

Im Score-JSON pro Note `role` und oben `roles` mit Taktbereichen, z. B.:

```json
"roles": [{"name": "Anna", "bars": [0, 7]}, {"name": "Chor", "bars": [8, 15]}, {"name": "Onkel", "bars": [16, 19]}]
```

Die Ausrichtung reicht `role` durch; Seite und MusicXML färben danach.

## 6. Spektrogramm

```
./mp.ps1 tool spectrogram work\subtracted\NN_vocals.wav web\data\NN_spec.png --json web\data\NN.json --range-db 35
```

Rendert den Gesangsstem auf dem Halbtonraster als PNG und trägt `spec` in
die genannten Song-JSONs ein.

## 7. Veröffentlichen auf der Seite

Ablauf: phrases → im Produktions-Repo committen → pushen. Gepackt wird, was der
Editor zeigt und speichert (`web/data/`), es gibt keine eigene Pack-Kopie.

1. Phrasen vergeben (schreibt `web/data/NN.json` neu): `./mp.ps1 tool phrases NN`
2. Die geänderten `web/data/` im Produktions-Repo committen.
3. Auf `main` des Produktions-Repos pushen. Dessen Workflow checkt die Engine in
   der Version aus `engine.ref` aus, baut mit `MP_PRODUCTION` (Titel, Logo,
   Icons, `storageId`), packt mit dem Actions-Secret `PITCH_PASSWORD` und dem
   committeten `salt` und pusht `dist/` auf den Branch `gh-pages` des öffentlichen
   Site-Repos (ADR 0007).

Lokal packen zum Prüfen (Passwort wird abgefragt, nie gespeichert):
`./mp.ps1 pack --out <ordner> --strict`. Optionen: `--strict`
(unvollständige Lieder brechen ab), `--new-salt` (neuer Salt, alle Nutzer müssen
neu entsperren; danach `salt` im Produktions-Repo ersetzen). Unvollständige Lieder
landen in `report.txt` und werden nicht gepackt.

Lokal ansehen: `./mp.ps1 serve` → http://localhost:8765/
(Liederliste und Titel aus `sources/config.json`, Range-Requests, speichert Notenänderungen aus dem Editiermodus nach
`web/data/<id>.json`, mit Zeitstempel-Kopie in `work/edits/`).

## Komplettlauf für ein neues Lied mit Noten-PDF

```
./mp.ps1 tool align_check NN
./mp.ps1 tool subtract_vocals NN
ffmpeg ... (1c)
./mp.ps1 tool extract_pitch_nn NN work\subtracted\NN_vocals.wav "Titel" --method crepe --audio NN_mix.mp3 --stem-file vocals=NN_vocals.mp3 --stem-file no_vocals=NN_no_vocals.mp3 --mix work\decoded\NN_mix.wav
./mp.ps1 tool score_from_pdf <pdf> work\score\NN_score.json --key-flats N       (oder abc_to_score / score_from_musicxml)
./mp.ps1 tool align_score work\score\NN_score.json work\pitch\NN.json work\pitch\NN_aligned.json --bpm B --passes P --snap
./mp.ps1 tool spectrogram work\subtracted\NN_vocals.wav web\data\NN_spec.png --json web\data\NN.json --range-db 35
```
