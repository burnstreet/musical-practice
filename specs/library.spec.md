---
name: Library
description: Manifest fetch, pre-unlock size info, full download after unlock with progress, per-file IndexedDB storage, change detection, song access, offline behaviour.
targets:
  - ../src/core/library.ts
---

# Library

Fetches and stores the bundle. Hands decrypted songs to the app. Uses vault for decrypt only.

```ts { .api }
export interface DownloadProgress { doneBytes: number; totalBytes: number; readySongs: string[]; scriptReady: boolean; done: boolean; error?: string }
export interface LoadedSong { meta: SongMeta; song: Song; voices: Blob; backing: Blob }
export interface LoadedScript { script: Script; audio(itemId: string): Promise<Blob> }   // audio decrypts one line on demand

export interface Library {
  fetchManifest(): Promise<Manifest | null>         // null when offline or 404; cached copy kept
  sizeInfo(): { songCount: number; totalBytes: number } | null   // from fetched or cached manifest
  sync(): Promise<void>                              // after unlock; resolves when all files stored or failed
  onProgress(fn: (p: DownloadProgress) => void): void
  songs(): SongMeta[]                                // from decrypted library; [] when locked
  roles(): Role[]
  isReady(songId: string): boolean                   // all three files stored
  getSong(songId: string): Promise<LoadedSong>       // throws when not ready
  hasScript(): boolean                               // library carries a script
  scriptReady(): boolean                             // script file and all its audio stored
  getScript(): Promise<LoadedScript>                 // throws when not ready
  wipe(): Promise<void>                              // registered with vault.onWipe
}
```

- Storage: IndexedDB store `files` keyed by file id, value = ciphertext bytes. Store `meta` holds last manifest.
- `sync` order: library file, then songs by number, per song notes then voices then backing, then the script file and its audio files in play order (library `script`, see script-format). Files already stored with the same id are skipped. Files in store not in manifest are deleted after sync.
- `scriptReady` turns true once the script file and every audio file of `script.audio` are stored. No `script` in the library: `hasScript` false, `scriptReady` false.
- `getScript` decrypts and parses the script file. `audio(itemId)` decrypts that line's file and returns a Blob typed `audio/mpeg`.
- Progress event after each file. `readySongs` grows as a song's three files land.
- Fetch failure: retry 3 times with 2 s pause, then continue with next file, report `error` at end. Next `sync` resumes.
- `getSong` decrypts the three files, returns Blobs typed `audio/mpeg`. No decrypted bytes stored.
- Offline start: `fetchManifest` null, cached manifest used, `songs()` works when files present.
  `[@test] ../tests/steps/library.steps.ts`

```gherkin
Feature: Size before unlock
  Scenario: size from public manifest
    Given a server manifest with songCount 10 and totalBytes 95000000
    When I fetch the manifest while locked
    Then sizeInfo gives songCount 10 and totalBytes 95000000

  Scenario: offline without cache
    Given the server is unreachable and no cached manifest
    When I fetch the manifest
    Then I get null and sizeInfo gives null

Feature: Download
  Scenario: full sync with progress
    Given an unlocked vault and a manifest with 2 songs of 3 files each plus the library
    When I sync
    Then progress events arrive with doneBytes rising to totalBytes
    And readySongs ends as both song ids and done is true

  Scenario: song ready before sync finishes
    Given an unlocked vault and a manifest with songs "01" and "02"
    When sync has stored the library and all files of "01"
    Then isReady("01") is true and isReady("02") is false

  Scenario: unchanged files skipped
    Given a completed sync
    When I sync again with the same manifest
    Then no file is fetched

  Scenario: changed file re-downloaded, orphan dropped
    Given a completed sync where song "01" notes had id "aaaaaaaaaaaaaaaa"
    When the manifest now lists notes id "bbbbbbbbbbbbbbbb" for song "01" and I sync
    Then only "bbbbbbbbbbbbbbbb" is fetched and "aaaaaaaaaaaaaaaa" is deleted from the store

  Scenario: network failure mid-sync
    Given fetching the voices file of song "02" fails 4 times
    When I sync
    Then done is true with an error, readySongs contains "01" but not "02"
    And a later sync fetches only the missing file

Feature: Access
  Scenario: get a ready song
    Given a completed sync
    When I get song "01"
    Then I receive parsed notes, a voices Blob and a backing Blob of type audio/mpeg

  Scenario: locked library hides songs
    Given a locked vault
    Then songs() is empty and getSong throws

Feature: Wipe
  Scenario: wipe empties the store
    Given a completed sync
    When wipe runs
    Then isReady is false for every song and the file store is empty
```

Script download and access (dialog trainer).
  `[@test] ../tests/steps/library-script.steps.ts`

```gherkin
Feature: Script
  Scenario: script after the songs
    Given an unlocked vault and a manifest with song "01" and a script with 2 audio files
    When I sync
    Then the script file and its audio are fetched after the files of "01"
    And the last progress event has scriptReady true

  Scenario: library without script
    Given an unlocked vault and a library without script
    When I sync
    Then hasScript is false and getScript throws

  Scenario: line audio on demand
    Given a completed sync with a script whose line "aaaa" has audio
    When I get the script and ask for the audio of "aaaa"
    Then I receive a Blob of type audio/mpeg
```
