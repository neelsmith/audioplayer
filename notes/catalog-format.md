# Audio catalogs (`.cex`)

Same file format as imageviewer's catalogs (parser ported from imageviewer `src/lib/cex.ts`).

## Where they're found

- `.cex` files at the **top of the folder you open** are listed in the **Catalog** menu.
  `catalog.cex` (any case) is chosen automatically; otherwise the menu starts at "No catalog".
- Catalogs in subfolders are not picked up.
- `path` values are **relative to that folder** and may point into subfolders.
  An exact path match wins; otherwise a case-insensitive match is used.

## Format

- `|`-delimited, first non-skipped line is the header (case-insensitive; spaces → `_`).
- Blank lines, `// comments` and `#!labels` are skipped. A leading BOM is ignored.
- Rows with the wrong number of fields are kept but reported as warnings.

| Column | Required | Used for |
|---|---|---|
| `path` | yes | matching the file |
| `title` | | label in the list, player bar, window title, Now Playing |
| `composer` | | Group by → Composer; player bar second line; Now Playing artist if no performer |
| `performer` | | Group by → Performer; player bar second line; Now Playing artist. An `artist` column is read as `performer` |
| `album` | | Group by → Album; player bar second line; Now Playing album |
| `tags` | | Group by → Tag (comma-separated; a track appears under each tag); search |
| `caption` | | tooltip; search |
| `credits` | | tooltip; search |
| `license` | | tooltip |

Any optional column can be left out. Other columns aren't displayed but are searchable, so an imageviewer
catalog (`path|caption|credits|license|tags|year|place`) also works (its `year` and `place` are searchable only).

If a path is listed twice, later rows' values win but the first row's position is kept.

## Example

```
// Field recordings
path|title|composer|performer|album|credits|license|caption
WTC/01.mp3|Prelude in C major|Bach, J. S.|Leonhardt|Well-Tempered Clavier|Rec. NS|CC BY|Book 1
WTC/02.mp3|Fugue in C major|Bach, J. S.|Leonhardt|Well-Tempered Clavier|||
goldberg-aria.mp3|Aria|Bach, J. S.|Gould|Goldberg Variations|||
```

## Behaviour

- Group by (Folder / Composer / Performer / Album / Tag) is enabled only while a catalog is in use.
  Grouping is case-insensitive (label = first spelling in catalog order); each value is a single
  name (not split on commas, so "Bach, J. S." stays one composer); a final "No composer" /
  "No performer" / "No album" / "Untagged" group holds the rest. Only audio files appear in groups.
  Tags are the exception to single values: a track appears under each of its tags.
- Player bar second line: "Composer · Performer — Album", leaving out what's missing.
- Within a group: cataloged tracks in catalog row order, then uncataloged ones by path.
- Next / auto-advance stay within the group the track was picked from (or its folder in Folder view).
- Warnings (shown under the status line): parse problems, and listed files that weren't found
  (first 10 named).
- Switching catalogs or grouping never interrupts playback.

## Search

- The search box (shortcut `/`, Escape clears) filters whatever view is showing, with or without a catalog.
- Searched: the file path (file and folder names), plus **every cell of the track's catalog row** —
  all columns, including ones the app doesn't otherwise use (e.g. `license`, or your own `venue`, `notes`).
  If a path is listed twice, both rows are searchable. Case- and accent-insensitive (`dvorak` finds
  `Dvořák`); every word must match.
- While searching only matching audio files are shown, folders/groups with matches are expanded,
  empty groups disappear, and the status line shows the number of matches.
- Next / auto-advance follow the visible results (the track's folder or group, filtered).
- Opening another folder clears the search; changing it never interrupts playback.
