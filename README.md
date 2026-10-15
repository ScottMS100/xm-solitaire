# XM Solitaire (web / mobile)

A touch-friendly solitaire collection that runs in any browser and installs like an app on
Android, iPhone and iPad (a PWA). It is a port of [XM Solitaire](https://sourceforge.net/projects/xmsol/)
by Petr Lastovicka: the rules engine and the XML game definitions come from that program, so
**every game written for XM Solitaire works here**.

* 206 games: all 200 from XM Solitaire plus Spider (4 suits), Spider One Suit, Spiderette, TriPeaks,
  Beleaguered Castle, Streets and Alleys (`rules/popular.xml`; this file also replaces XM's Golf with a
  version that starts from a random card instead of an ace).
* Favorites list: Klondike, Klondike 3, Freecell, Spider (1/2/4 suits), Spiderette, **Eight Off**,
  **Spidercells**, Pyramid, TriPeaks, Golf, Yukon, Canfield, Forty Thieves, Scorpion, Baker's Game,
  Penguin, Easthaven, Baker's Dozen, Simple Simon, La Belle Lucie, Fan, Flower Garden,
  Streets and Alleys, Beleaguered Castle.
* Tap a card to move it to the best pile, or drag it (legal piles light up). Press and hold to peek
  at an overlapped card. Unlimited undo/redo, autosave, statistics, deal numbers, animations.
* Keyboard (as in XM Solitaire): **Delete** undo, **Insert** redo, **Home** undo all, **End** redo all; also Z / Y, N new deal, G game list.
* Works offline once installed. No accounts, no tracking, no network use after the first load.

## Run it on your computer

```
node tools/serve.mjs          # then open http://localhost:8080/
node tests/run.mjs            # plays random games in all 206 variants: dealing, undo/redo, save/restore
node tests/layout.mjs         # checks card sizes / on-screen placement at phone, tablet and desktop sizes
```

There is no build step and no dependencies: the `app` folder *is* the website.

## Put it on the web (so it can be installed on phones and iPads)

Installing and offline use require **https**. The simplest free options (upload the contents of this
folder, keep the `LICENSE` file and the source in place):

* **GitHub Pages**: create a public repository, upload the files, Settings → Pages → deploy from the main branch.
* **Netlify Drop** (app.netlify.com/drop) or Cloudflare Pages: drag the folder in.

Then on the device:

* **iPhone / iPad** (Safari): open the link → Share → *Add to Home Screen*.
* **Android** (Chrome): open the link → menu → *Install app* / *Add to Home screen*.

When you change any file, bump `CACHE` in `sw.js` (`xmsol-v1` → `xmsol-v2`) and add new files to its `SHELL`
list, so installed copies pick up the update.

## Adding games

A game is a few lines of XML in the format XM Solitaire uses (its help file *Mods_Rules.html* documents every
attribute; the games in `rules/standard.xml` and `rules/popular.xml` are good examples).

* **On the device:** Menu → *Add games…* → choose an `.xml` file. It is stored in the browser and can be removed again.
* **In the app files:** put the file in `rules/`, add its name to `rules/manifest.json` (`files`, optionally
  `featured` to show a game in the Favorites list) and add it to the `SHELL` list in `sw.js`.
  If a game has the same name as an earlier one, the later file wins.

## Project layout

```
index.html, css/app.css      page and styles
js/engine.js                 port of XM Solitaire's rule interpreter and game logic (GPL)
js/xml.js                    tiny XML parser for the rules files
js/layout.js                 turns XM's 0..1000 coordinates into pixels, sizes cards to fit the screen
js/ui.js                     canvas drawing, touch/mouse input, animation
js/app.js                    menus, saving, statistics, adding games
rules/                       standard.xml (from XM Solitaire), popular.xml, manifest.json
img/                         classic deck (XM Solitaire's standard one) and "modern" deck, backs, empty-pile markers, felt
sw.js, manifest.webmanifest  offline support / installability
tests/, tools/               test scripts and the local web server
```

## Known limits

* Offline mode (the service worker) could not be tested in the development browser; test "install, then go
  offline" once on a real device.
* No hints, no scoring (XM's score is not ported), no sound.
* In TriPeaks all peak cards are face up; in Golf and TriPeaks the game counts as won when every card, stock
  included, has been played.
* Games whose layout was designed for a wide window may look cramped on a phone held upright; landscape
  gives larger cards.

## License and credits

Copyright (C) Petr Lastovicka (XM Solitaire, original program and rules). Port to JavaScript for the web and
mobile. This program is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License** as published by the Free Software Foundation, either version 3 of the License
or (at your option) any later version. It is distributed without any warranty. See [LICENSE](LICENSE).
Original source: https://github.com/plastovicka/xmsol

Card images: the classic deck, back and markers come from XM Solitaire; the "modern" deck is from [Pixabay](https://pixabay.com/vectors/card-deck-deck-cards-playing-cards-161536/).
Because of the GPL, publish the source along with the app (hosting these files as-is does that), and avoid
the Apple App Store, whose terms conflict with the GPL; a home-screen web app avoids the problem.
